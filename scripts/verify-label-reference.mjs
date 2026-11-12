// Read private reference/output paths only from CLI arguments; never keep customer fixtures.
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { arrangeLabels } from "../src/lib/label-pdf.ts";
const [reference, output] = process.argv.slice(2);
if (!reference || !output)
  throw new Error(
    "Usage: node scripts/verify-label-reference.mjs reference.pdf output.pdf",
  );
// eslint-disable-next-line security/detect-non-literal-fs-filename -- Local diagnostic CLI explicitly accepts operator-chosen input and output files.
const bytes = new Uint8Array(await readFile(reference));
const pdf = await PDFDocument.load(bytes);
const { width, height } = pdf.getPage(0).getSize();
const regions = pdf.getPages().flatMap((page, index) => {
  const { width, height } = page.getSize();
  return Array.from({ length: 4 }, (_, slot) => ({
    page: index,
    x: ((slot % 2) * width) / 2,
    y: height - ((Math.floor(slot / 2) + 1) * height) / 2,
    width: width / 2,
    height: height / 2,
    selected: true,
    kind: "review",
  }));
});
// eslint-disable-next-line security/detect-non-literal-fs-filename -- Output is the explicit local CLI argument, never an HTTP request parameter.
await writeFile(output, await arrangeLabels(bytes, regions, 4));
console.log(
  JSON.stringify({
    referencePages: pdf.getPageCount(),
    referencePageSize: { width, height },
    outputPages: pdf.getPageCount(),
    regions: regions.length,
  }),
);
