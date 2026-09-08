import { describe, expect, it } from "vitest";
import { amazonApiErrorMessage, amazonRequestHeaders, amazonTimestamp } from "@/lib/marketplaces/amazon-http";

describe("Amazon SP-API HTTP helpers", () => {
  it("formats the required Amazon request timestamp", () => {
    expect(amazonTimestamp(new Date("2026-09-08T12:34:56.789Z"))).toBe("20260908T123456Z");
    expect(amazonRequestHeaders("token", new Date("2026-09-08T12:34:56.789Z"))).toMatchObject({
      "x-amz-date": "20260908T123456Z",
    });
  });

  it("turns a region mismatch into an actionable and bounded error", async () => {
    const response = new Response(JSON.stringify({
      errors: [{
        code: "Unauthorized",
        message: "Access to requested resource is denied.",
        details: "The marketplaces you provided are not valid for region.",
      }],
    }), {
      status: 403,
      headers: { "x-amzn-requestid": "request-123" },
    });

    await expect(amazonApiErrorMessage(response)).resolves.toBe(
      "Amazon rejected this marketplace/region combination. Choose the SP-API region that contains every marketplace ID. Request ID: request-123.",
    );
  });
});
