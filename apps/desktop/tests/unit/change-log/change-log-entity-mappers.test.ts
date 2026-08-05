import { describe, expect, it } from "vitest";
import {
  getChangeLogEntityToRowMapper,
  subjectBackupRowToEntity,
} from "../../../src/data/sqlite/change-log/change-log-entity-mappers";

const ISO = "2026-07-29T10:00:00.000Z";

describe("getChangeLogEntityToRowMapper", () => {
  it("maps a domain Subject payload onto the physical subjects row", () => {
    const mapper = getChangeLogEntityToRowMapper("subjects");
    expect(mapper).toBeDefined();

    const row = mapper!({
      id: "sub_01",
      centerCode: "CS-CASA-001",
      deviceOrigin: "dev_1",
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: "usr_1",
      deletedAt: null,
      version: 3,
      name: { fr: "Mathématiques", ar: "الرياضيات" },
      code: "MATH",
      active: true,
    });

    expect(row).toEqual({
      id: "sub_01",
      center_code: "CS-CASA-001",
      device_origin: "dev_1",
      created_at: ISO,
      updated_at: ISO,
      updated_by: "usr_1",
      deleted_at: null,
      version: 3,
      name_fr: "Mathématiques",
      name_ar: "الرياضيات",
      code: "MATH",
      active: 1,
    });
  });

  it("accepts Date instances as well as ISO strings (pre-JSON domain entity)", () => {
    const mapper = getChangeLogEntityToRowMapper("subjects");
    const row = mapper!({
      id: "sub_01",
      centerCode: "CS-CASA-001",
      deviceOrigin: "dev_1",
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: "usr_1",
      deletedAt: new Date(ISO),
      version: 0,
      name: { fr: "M", ar: "م" },
      code: null,
      active: false,
    });
    expect(row["created_at"]).toBe(ISO);
    expect(row["deleted_at"]).toBe(ISO);
    expect(row["active"]).toBe(0);
  });

  it("falls back to the SHEET_SQL logical→physical registry for backup-sheet entityTypes", () => {
    const mapper = getChangeLogEntityToRowMapper("rooms");
    expect(mapper).toBeDefined();

    const row = mapper!({
      id: "rom_01",
      centerCode: "CS-CASA-001",
      deviceOrigin: "dev_1",
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: "usr_1",
      deletedAt: null,
      version: 1,
      name: "Salle A",
      capacity: 20,
      active: true,
    });

    expect(row).toEqual({
      id: "rom_01",
      center_code: "CS-CASA-001",
      device_origin: "dev_1",
      created_at: ISO,
      updated_at: ISO,
      updated_by: "usr_1",
      deleted_at: null,
      version: 1,
      name: "Salle A",
      capacity: 20,
      active: 1,
    });
  });

  it("returns undefined for an entityType neither registered nor a backup sheet", () => {
    expect(getChangeLogEntityToRowMapper("does-not-exist")).toBeUndefined();
  });
});

describe("subjectBackupRowToEntity", () => {
  it("converts the flat workbook subjects row to the canonical domain Subject", () => {
    const subject = subjectBackupRowToEntity({
      id: "sub_01",
      centerCode: "CS-CASA-001",
      deviceOrigin: "dev_1",
      createdAt: ISO,
      updatedAt: ISO,
      updatedBy: "usr_1",
      deletedAt: ISO,
      version: 2,
      name_fr: "Physique",
      name_ar: "فيزياء",
      code: "PC",
      active: true,
    });

    expect(subject).toEqual({
      id: "sub_01",
      centerCode: "CS-CASA-001",
      deviceOrigin: "dev_1",
      createdAt: new Date(ISO),
      updatedAt: new Date(ISO),
      updatedBy: "usr_1",
      deletedAt: new Date(ISO),
      version: 2,
      name: { fr: "Physique", ar: "فيزياء" },
      code: "PC",
      active: true,
    });
  });
});
