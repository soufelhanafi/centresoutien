import { describe, it, expect } from "vitest";
import { extractClientIp } from "./auth-audit";
import {
  generateResetCode,
  persistResetCode,
  resetRequestSchema,
  verifyAndConsumeResetCode,
} from "./auth-reset";

// No Upstash credentials in the test env, so the module falls back to its
// in-memory code store — exactly the path these helpers must stay correct on.
// Each test uses a distinct email so the shared module store never bleeds
// state between cases.

describe("generateResetCode", () => {
  it("is always a zero-padded 6-digit string", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateResetCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("extractClientIp", () => {
  it("prefers the Netlify connection-ip header over everything else", () => {
    const headers = new Headers({
      "x-nf-client-connection-ip": "203.0.113.7",
      "x-real-ip": "10.0.0.1",
      "x-forwarded-for": "1.1.1.1, 2.2.2.2",
    });
    expect(extractClientIp(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when the Netlify header is absent", () => {
    const headers = new Headers({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "1.1.1.1" });
    expect(extractClientIp(headers)).toBe("10.0.0.1");
  });

  it("uses the RIGHTMOST x-forwarded-for entry (leftmost is attacker-controlled)", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" });
    expect(extractClientIp(headers)).toBe("3.3.3.3");
  });

  it("returns 'unknown' when no client-ip header is present", () => {
    expect(extractClientIp(new Headers())).toBe("unknown");
  });
});

describe("resetRequestSchema locale (SOU-273)", () => {
  const base = { email: "owner@example.com", accountId: "acc-1", centerCode: "CS-CASA-001" };

  it("defaults an omitted locale to French (older desktop builds)", () => {
    const parsed = resetRequestSchema.parse(base);
    expect(parsed.locale).toBe("fr");
  });

  it("accepts an explicit Arabic locale", () => {
    expect(resetRequestSchema.parse({ ...base, locale: "ar" }).locale).toBe("ar");
  });

  it("rejects an unsupported locale", () => {
    expect(resetRequestSchema.safeParse({ ...base, locale: "en" }).success).toBe(false);
  });
});

describe("persistResetCode + verifyAndConsumeResetCode", () => {
  it("verifies the correct code once, then rejects reuse (single-use)", async () => {
    const identity = { email: "single-use@example.com", accountId: "acc-1" };
    await persistResetCode(identity, "123456");

    expect(await verifyAndConsumeResetCode({ ...identity, code: "123456" })).toBe(true);
    expect(await verifyAndConsumeResetCode({ ...identity, code: "123456" })).toBe(false);
  });

  it("rejects a wrong guess WITHOUT burning the live code", async () => {
    const identity = { email: "no-burn@example.com", accountId: "acc-2" };
    await persistResetCode(identity, "222222");

    expect(await verifyAndConsumeResetCode({ ...identity, code: "999999" })).toBe(false);
    // The real code must still work after a wrong attempt.
    expect(await verifyAndConsumeResetCode({ ...identity, code: "222222" })).toBe(true);
  });

  it("binds to the latest code: re-issuing supersedes the prior code", async () => {
    const identity = { email: "latest@example.com", accountId: "acc-3" };
    await persistResetCode(identity, "111111");
    await persistResetCode(identity, "444444");

    expect(await verifyAndConsumeResetCode({ ...identity, code: "111111" })).toBe(false);
    expect(await verifyAndConsumeResetCode({ ...identity, code: "444444" })).toBe(true);
  });

  it("returns false for an identity that never requested a code", async () => {
    const identity = { email: "unknown@example.com", accountId: "acc-4" };
    expect(await verifyAndConsumeResetCode({ ...identity, code: "000000" })).toBe(false);
  });
});
