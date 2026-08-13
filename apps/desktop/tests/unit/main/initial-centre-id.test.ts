import { describe, expect, it } from "vitest";
import { resolveInitialCentreId } from "../../../src/main/initial-centre-id";

describe("resolveInitialCentreId", () => {
  it("defaults an unset center selection to local", () => {
    expect(resolveInitialCentreId(undefined)).toBe("local");
  });

  it("does not reopen the retired demo database when selected explicitly", () => {
    expect(resolveInitialCentreId("demo")).toBe("local");
  });

  it("keeps a normal center selection", () => {
    expect(resolveInitialCentreId("casa")).toBe("casa");
  });
});
