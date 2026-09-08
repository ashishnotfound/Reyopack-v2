import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export function securelyMatches(actual: string | null, expected: string | undefined) {
  if (!actual || !expected) return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}
