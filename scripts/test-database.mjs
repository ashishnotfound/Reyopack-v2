import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import pg from "pg";

if (existsSync(".env.local") && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(".env.local");
}

const databaseUrl =
  process.env.SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const parsedDatabaseUrl = new URL(databaseUrl);
const isHostedSupabase = parsedDatabaseUrl.hostname.endsWith(".supabase.co");
const testsDirectory = join(process.cwd(), "supabase", "tests");
const testFiles = (await readdir(testsDirectory))
  .filter((file) => file.endsWith(".sql"))
  .sort();

if (testFiles.length === 0) {
  throw new Error("No database tests were found in supabase/tests.");
}

let ssl;

if (isHostedSupabase) {
  const certificatePath = join(
    process.cwd(),
    "supabase",
    "certs",
    "prod-ca-2021.crt",
  );
  ssl = {
    ca: await readFile(certificatePath, "utf8"),
    rejectUnauthorized: true,
  };

  // node-postgres lets URL SSL parameters replace the explicit CA object.
  // Remove them so the pinned CA and hostname verification remain effective.
  for (const parameter of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) {
    parsedDatabaseUrl.searchParams.delete(parameter);
  }
}

const client = new pg.Client({
  connectionString: parsedDatabaseUrl.toString(),
  ssl,
});

try {
  await client.connect();

  for (const testFile of testFiles) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- testFile is returned by readdir on the fixed tests directory and filtered to .sql.
    const sql = await readFile(join(testsDirectory, testFile), "utf8");
    const queryResult = await client.query(sql);
    const results = Array.isArray(queryResult) ? queryResult : [queryResult];
    const tapLines = results.flatMap((result) =>
      result.rows.flatMap((row) =>
        Object.values(row).filter(
          (value) =>
            typeof value === "string" &&
            (/^ok\b/.test(value) || /^not ok\b/.test(value) || /^1\.\./.test(value)),
        ),
      ),
    );

    for (const line of tapLines) {
      console.log(line);
    }

    const plan = tapLines.find((line) => /^1\.\./.test(line));
    const plannedTests = plan ? Number(plan.slice(3)) : 0;
    const passedTests = tapLines.filter((line) => /^ok\b/.test(line)).length;
    const failures = tapLines.filter((line) => /^not ok\b/.test(line));

    if (!plannedTests || failures.length > 0 || passedTests !== plannedTests) {
      throw new Error(
        `${testFile} failed: ${passedTests}/${plannedTests || "?"} assertions passed.`,
      );
    }

    console.log(`✓ ${testFile}: ${passedTests} assertions passed`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Database tests failed: ${message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
