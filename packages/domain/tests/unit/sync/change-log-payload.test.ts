import { describe, expect, it } from "vitest";
import {
  CURRENT_CHANGE_LOG_PAYLOAD_VERSION,
  deserializeChangeLogPayload,
  serializeChangeLogPayload,
} from "../../../src/sync/change-log-payload";

const SUBJECT = {
  id: "sub_01HW",
  centerCode: "CS-CASA-001",
  deviceOrigin: "dev_1",
  createdAt: new Date("2026-07-29T10:00:00Z"),
  updatedAt: new Date("2026-07-29T10:00:00Z"),
  updatedBy: "usr_1",
  deletedAt: null,
  version: 0,
  name: { fr: "Mathématiques", ar: "الرياضيات" },
  code: null,
  active: true,
};

describe("serializeChangeLogPayload", () => {
  it("wraps the entity in a versioned envelope with the current version", () => {
    const parsed = JSON.parse(serializeChangeLogPayload(SUBJECT)) as Record<
      string,
      unknown
    >;
    expect(parsed["version"]).toBe(CURRENT_CHANGE_LOG_PAYLOAD_VERSION);
    expect(parsed["entity"]).toEqual({
      ...SUBJECT,
      createdAt: SUBJECT.createdAt.toISOString(),
      updatedAt: SUBJECT.updatedAt.toISOString(),
    });
  });

  it("serializes dates as ISO strings but preserves the nested domain shape", () => {
    const raw = serializeChangeLogPayload(SUBJECT);
    expect(raw).toContain('"name":{"fr":"Mathématiques"');
    expect(raw).not.toContain("name_fr");
  });
});

describe("deserializeChangeLogPayload", () => {
  it("returns the stored entity (dates arrive as the JSON-form ISO strings)", () => {
    const raw = serializeChangeLogPayload(SUBJECT);
    const entity = deserializeChangeLogPayload(raw) as Record<string, unknown>;
    expect(entity["id"]).toBe(SUBJECT.id);
    expect(entity["name"]).toEqual(SUBJECT.name);
    expect(entity["createdAt"]).toBe(SUBJECT.createdAt.toISOString());
  });

  it("upcasts older payload versions through the registered upcasters, oldest first", () => {
    const legacy = JSON.stringify({
      version: 1,
      entity: { id: "sub_1", flag: false },
    });
    // One registered upcaster ⇒ this device knows versions up to 2.
    const v2 = deserializeChangeLogPayload(legacy, [
      (entity) => ({ ...(entity as object), flag: true }),
    ]);
    expect(v2).toEqual({ id: "sub_1", flag: true });
  });

  it("skips upcasters already applied when the payload is already at the newest known version", () => {
    const v2Payload = JSON.stringify({
      version: 2,
      entity: { id: "sub_1", flag: true },
    });
    const applied = deserializeChangeLogPayload(v2Payload, [
      (entity) => ({ ...(entity as object), flag: true }), // v1→v2 — must NOT run
    ]);
    expect(applied).toEqual({ id: "sub_1", flag: true });
  });

  it("rejects a malformed envelope (missing version or entity)", () => {
    expect(() => deserializeChangeLogPayload('{"version":1}')).toThrow(
      /malformed payload envelope/,
    );
    expect(() => deserializeChangeLogPayload('{"entity":{}}')).toThrow(
      /malformed payload envelope/,
    );
    expect(() => deserializeChangeLogPayload('"just a string"')).toThrow(
      /malformed payload envelope/,
    );
    expect(() =>
      deserializeChangeLogPayload('{"version":0,"entity":{}}'),
    ).toThrow(/malformed payload envelope/);
    expect(() =>
      deserializeChangeLogPayload('{"version":1,"entity":null}'),
    ).toThrow(/malformed payload envelope/);
  });

  it("rejects invalid JSON", () => {
    expect(() => deserializeChangeLogPayload("not json")).toThrow(
      /not valid JSON/,
    );
  });

  it("refuses a payload from a version whose upcaster this device lacks", () => {
    const future = JSON.stringify({ version: 2, entity: {} });
    expect(() => deserializeChangeLogPayload(future)).toThrow(
      /upcasters this device lacks/,
    );
  });
});
