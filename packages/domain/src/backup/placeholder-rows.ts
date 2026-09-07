import type { BackupRow, BackupSheetName, BackupSheetSpec } from './backup-workbook';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

/**
 * Minimal domain-field defaults for a catalog placeholder row (SOU-317): just
 * enough to satisfy each table's NOT NULL / CHECK constraints, clearly marked
 * as needing admin attention. Only entities reachable via a `catalog` column
 * reference (parents, teachers, rooms, subjects, niveaux) are covered — every
 * other sheet name is a programming error, since `resolveWorkbookReferences`
 * only ever asks for a placeholder on those five.
 */
function placeholderDomainFields(sheetName: BackupSheetName): BackupRow {
  switch (sheetName) {
    case 'parents':
      return {
        name: 'Parent importé (à compléter)',
        phone: '',
        email: null,
        relation: 'autre',
        whatsappOptIn: false,
      };
    case 'teachers':
      return {
        name_fr: 'Enseignant importé (à compléter)',
        name_ar: 'معلم مستورد (يجب إكماله)',
        cin: null,
        phone: '',
        email: null,
        subjectIds: '',
        niveauIds: '',
        active: true,
      };
    case 'rooms':
      return {
        name: 'Salle importée (à compléter)',
        capacity: 1,
        active: true,
      };
    case 'subjects':
      return {
        name_fr: 'Matière importée (à compléter)',
        name_ar: 'مادة مستوردة (يجب إكمالها)',
        code: null,
        active: true,
      };
    case 'niveaux':
      return {
        name_fr: 'Niveau importé (à compléter)',
        name_ar: 'مستوى مستورد (يجب إكماله)',
        code: null,
        category: 'college',
        active: true,
      };
    default:
      throw new Error(`no placeholder fields declared for catalog sheet "${sheetName}"`);
  }
}

/**
 * Build a full, insertable placeholder row for a catalog id referenced by
 * another sheet but missing from both the center and the rest of the workbook
 * (SOU-317) — e.g. a student's `guardianIds` naming a parent that was itself
 * skipped as invalid, or a teacher id from an older, partially-restored
 * export. The placeholder keeps the *exact* referenced id (the reference can
 * only resolve if a row exists under that id) and a full envelope, so the
 * referencing row imports instead of being rejected; the admin fills in the
 * real details afterward. `naturalKey` is synthesized from the id itself —
 * unique by construction, and self-evidently not a real duplicate-matching
 * key — since a placeholder has no real name/phone to derive one from.
 */
export function buildPlaceholderRow(
  spec: BackupSheetSpec,
  id: string,
  centerCode: CenterCode,
  now: string,
  deviceOrigin: DeviceId,
  updatedBy: UserId,
): BackupRow {
  const row: BackupRow = {
    id,
    centerCode,
    deviceOrigin,
    createdAt: now,
    updatedAt: now,
    updatedBy,
    deletedAt: null,
    version: 0,
    ...placeholderDomainFields(spec.name),
  };
  if (spec.naturalKeyColumn !== null) {
    row[spec.naturalKeyColumn] = `${centerCode}::placeholder::${id}`;
  }
  return row;
}
