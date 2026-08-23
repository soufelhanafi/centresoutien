import { describe, expect, it } from "vitest";
import {
  createInMemorySuppressionStore,
  isEmailSuppressed,
  type SuppressionStore,
} from "./suppression-store";

// Each test builds a FRESH in-memory store, so no state leaks between cases and
// the suite stays order-independent (never touches the module singleton).

describe("in-memory suppression store", () => {
  it("reports an address as suppressed only after it is recorded", async () => {
    const store = createInMemorySuppressionStore();
    expect(await store.isSuppressed("nobody@example.com")).toBe(false);
    await store.suppress("nobody@example.com", "bounce");
    expect(await store.isSuppressed("nobody@example.com")).toBe(true);
  });

  it("keys by normalized address (case- and whitespace-insensitive)", async () => {
    const store = createInMemorySuppressionStore();
    await store.suppress("  Bounced@Example.COM ", "complaint");
    expect(await store.isSuppressed("bounced@example.com")).toBe(true);
  });

  it("keeps distinct addresses independent", async () => {
    const store = createInMemorySuppressionStore();
    await store.suppress("one@example.com", "bounce");
    expect(await store.isSuppressed("two@example.com")).toBe(false);
  });
});

describe("isEmailSuppressed", () => {
  it("returns the store's answer when it is healthy", async () => {
    const yes: SuppressionStore = {
      suppress: async () => {},
      isSuppressed: async () => true,
    };
    expect(await isEmailSuppressed("x@example.com", yes)).toBe(true);
  });

  it("fails OPEN (returns false) when the store throws, never blocking a send", async () => {
    const broken: SuppressionStore = {
      suppress: async () => {},
      isSuppressed: async () => {
        throw new Error("upstash_down");
      },
    };
    expect(await isEmailSuppressed("x@example.com", broken)).toBe(false);
  });
});
