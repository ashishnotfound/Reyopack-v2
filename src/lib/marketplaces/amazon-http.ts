type AmazonErrorRecord = Record<string, unknown>;

export function amazonTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

export function amazonRequestHeaders(accessToken: string, date = new Date()): HeadersInit {
  return {
    "user-agent": "ReyoPack/1.0 (Language=TypeScript)",
    "x-amz-access-token": accessToken,
    "x-amz-date": amazonTimestamp(date),
  };
}

export function amazonRetryDelay(response: Response, attempt: number) {
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return Math.min(180_000, retryAfterSeconds * 1_000);
  const rate = Number(response.headers.get("x-amzn-ratelimit-limit"));
  if (response.status === 429 && Number.isFinite(rate) && rate > 0) return Math.min(180_000, Math.max(1_000, Math.ceil(1_000 / rate)));
  return Math.min(30_000, 750 * 2 ** attempt + Math.random() * 250);
}

export async function amazonApiErrorMessage(response: Response) {
  let payload: unknown = null;
  try {
    payload = await response.json() as unknown;
  } catch {
    // Amazon can return an empty or non-JSON body for some gateway failures.
  }

  const root = recordFrom(payload);
  const firstError = arrayFrom(root.errors).map(recordFrom)[0] ?? {};
  const code = cleanText(firstError.code);
  const message = cleanText(firstError.message);
  const details = cleanText(firstError.details);
  const requestId = cleanText(response.headers.get("x-amzn-requestid"));
  const combined = [message, details].filter(Boolean).join(" ");

  let summary: string;
  if (/marketplaces?.+not valid for region/i.test(combined)) {
    summary = "Amazon rejected this marketplace/region combination. Choose the SP-API region that contains every marketplace ID.";
  } else {
    const reason = details ?? message;
    summary = `Amazon SP-API returned ${response.status}${code ? ` (${code})` : ""}${reason ? `: ${reason}` : "."}`;
  }

  return `${summary}${requestId ? ` Request ID: ${requestId}.` : ""}`.slice(0, 500);
}

function recordFrom(value: unknown): AmazonErrorRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as AmazonErrorRecord : {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 300) : null;
}
