import { z } from 'zod';

// TEMP: swap for packages/domain export on SOU-260 merge.
// The domain-backend agent publishes `Niveau` / `NiveauId` / `NiveauCategory`
// plus the `niveau.*` IPC channels in `apps/desktop/src/shared/ipc/contract.ts`.
// Until then the renderer builds against this exact local contract. Deleting
// this file is the merge step; the gateway's typed bridge in
// `lib/niveaux/ipc-niveaux-gateway.ts` then calls `window.api` directly.

export type NiveauId = string;
export type NiveauCategory = 'primaire' | 'college' | 'lycee';

/** Stable category order for the manage screen's grouped sections. */
export const NIVEAU_CATEGORIES = ['primaire', 'college', 'lycee'] as const satisfies readonly NiveauCategory[];

export type LocalizedNiveauName = { readonly fr: string; readonly ar: string };

export type Niveau = {
  readonly id: NiveauId;
  readonly name: LocalizedNiveauName;
  readonly code: string | null;
  readonly category: NiveauCategory;
  readonly active: boolean;
  // + envelope (centerCode, createdAt, updatedAt, updatedBy, deletedAt,
  // deviceOrigin, version) — stripped at the IPC boundary, like every other view.
};

export type NiveauInput = {
  readonly name: LocalizedNiveauName;
  /** Optional — `undefined` (or `''`) means "no code"; the domain schema normalizes, like `SubjectInput.code`. */
  readonly code?: string | undefined;
  readonly category: NiveauCategory;
};

export type NiveauUpdateInput = NiveauInput & {
  readonly id: NiveauId;
  readonly active: boolean;
};

/** One level paired with its reference counts, as `niveau.listWithUsage` returns. */
export type NiveauUsage = {
  readonly niveau: Niveau;
  readonly studentCount: number;
  readonly groupCount: number;
  readonly teacherCount: number;
};

export type NiveauChannel =
  | 'niveau.list'
  | 'niveau.listActive'
  | 'niveau.listWithUsage'
  | 'niveau.create'
  | 'niveau.update';

/** The read channels take no request body (mirrors `subject.listWithUsage`). */
export type NiveauEmptyRequest = { readonly [key: string]: never };

export type NiveauRequest = {
  'niveau.list': NiveauEmptyRequest;
  'niveau.listActive': NiveauEmptyRequest;
  'niveau.listWithUsage': NiveauEmptyRequest;
  'niveau.create': NiveauInput;
  'niveau.update': NiveauUpdateInput;
};

export type NiveauResponse = {
  'niveau.list': { niveaux: readonly Niveau[] };
  'niveau.listActive': { niveaux: readonly Niveau[] };
  'niveau.listWithUsage': { niveaux: readonly NiveauUsage[] };
  'niveau.create': { niveau: Niveau };
  'niveau.update': { niveau: Niveau };
};

export type NiveauRequestOf<C extends NiveauChannel> = NiveauRequest[C];
export type NiveauResponseOf<C extends NiveauChannel> = NiveauResponse[C];

// TEMP: the create/update field schemas. The domain will ship its own
// `niveauInputSchema` / `niveauUpdateInputSchema`; until then the forms validate
// with these local equivalents (same error-code conventions as the domain).
export const NIVEAU_NAME_MAX = 80;
export const NIVEAU_CODE_MAX = 40;
export const NIVEAU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;

const niveauLocalizedName = z
  .string()
  .trim()
  .min(1, { message: 'required' })
  .max(NIVEAU_NAME_MAX, { message: 'too-long' });

const niveauName = z.object({ fr: niveauLocalizedName, ar: niveauLocalizedName });

const niveauCode = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = value?.trim().toUpperCase();
    return normalized === undefined || normalized === '' ? undefined : normalized;
  })
  .pipe(
    z
      .string()
      .max(NIVEAU_CODE_MAX, { message: 'too-long' })
      .regex(NIVEAU_CODE_PATTERN, { message: 'invalid-code' })
      .optional(),
  );

export const niveauInputSchema = z.object({
  name: niveauName,
  code: niveauCode,
  category: z.enum(NIVEAU_CATEGORIES, { error: 'invalid-category' }),
});

export type NiveauInputSchemaOutput = z.output<typeof niveauInputSchema>;

// TEMP: the seed catalogue the domain migration publishes (Moroccan levels).
// Used only as query `initialData` so the screens render before the merge;
// once `niveau.*` channels live, real rows replace it (identical content).
export const DEFAULT_NIVEAU_CATALOG: readonly Niveau[] = [
  { id: 'niv_seed_1ap', name: { fr: '1ère année primaire', ar: 'السنة الأولى ابتدائي' }, code: '1AP', category: 'primaire', active: true },
  { id: 'niv_seed_2ap', name: { fr: '2ème année primaire', ar: 'السنة الثانية ابتدائي' }, code: '2AP', category: 'primaire', active: true },
  { id: 'niv_seed_3ap', name: { fr: '3ème année primaire', ar: 'السنة الثالثة ابتدائي' }, code: '3AP', category: 'primaire', active: true },
  { id: 'niv_seed_4ap', name: { fr: '4ème année primaire', ar: 'السنة الرابعة ابتدائي' }, code: '4AP', category: 'primaire', active: true },
  { id: 'niv_seed_5ap', name: { fr: '5ème année primaire', ar: 'السنة الخامسة ابتدائي' }, code: '5AP', category: 'primaire', active: true },
  { id: 'niv_seed_6ap', name: { fr: '6ème année primaire', ar: 'السنة السادسة ابتدائي' }, code: '6AP', category: 'primaire', active: true },
  { id: 'niv_seed_1ac', name: { fr: '1ère année collège', ar: 'الأولى إعدادي' }, code: '1AC', category: 'college', active: true },
  { id: 'niv_seed_2ac', name: { fr: '2ème année collège', ar: 'الثانية إعدادي' }, code: '2AC', category: 'college', active: true },
  { id: 'niv_seed_3ac', name: { fr: '3ème année collège', ar: 'الثالثة إعدادي' }, code: '3AC', category: 'college', active: true },
  { id: 'niv_seed_tc-sci', name: { fr: 'TC Sciences', ar: 'الجذع المشترك علوم' }, code: 'TC-SCI', category: 'lycee', active: true },
  { id: 'niv_seed_tc-lettres', name: { fr: 'TC Lettres & Sciences Humaines', ar: 'الجذع المشترك آداب وعلوم إنسانية' }, code: 'TC-LETTRES', category: 'lycee', active: true },
  { id: 'niv_seed_tc-tech', name: { fr: 'TC Technologique', ar: 'الجذع المشترك تكنولوجي' }, code: 'TC-TECH', category: 'lycee', active: true },
  { id: 'niv_seed_1bac-sci', name: { fr: '1ère Bac Sciences Expérimentales', ar: 'الأولى باك علوم تجريبية' }, code: '1BAC-SCI', category: 'lycee', active: true },
  { id: 'niv_seed_1bac-maths', name: { fr: '1ère Bac Maths', ar: 'الأولى باك رياضيات' }, code: '1BAC-MATHS', category: 'lycee', active: true },
  { id: 'niv_seed_1bac-lettres', name: { fr: '1ère Bac Lettres', ar: 'الأولى باك آداب' }, code: '1BAC-LETTRES', category: 'lycee', active: true },
  { id: 'niv_seed_1bac-eco', name: { fr: '1ère Bac Économie & Gestion', ar: 'الأولى باك اقتصاد وتدبير' }, code: '1BAC-ECO', category: 'lycee', active: true },
  { id: 'niv_seed_1bac-tech', name: { fr: '1ère Bac Sciences & Technologies', ar: 'الأولى باك علوم وتكنولوجيات' }, code: '1BAC-TECH', category: 'lycee', active: true },
  { id: 'niv_seed_2bac-svt', name: { fr: '2ème Bac SVT', ar: 'الثانية باك علوم الحياة والأرض' }, code: '2BAC-SVT', category: 'lycee', active: true },
  { id: 'niv_seed_2bac-pc', name: { fr: '2ème Bac Physique-Chimie', ar: 'الثانية باك علوم فيزيائية' }, code: '2BAC-PC', category: 'lycee', active: true },
  { id: 'niv_seed_2bac-sm-a', name: { fr: '2ème Bac Sciences Maths A', ar: 'الثانية باك علوم رياضية أ' }, code: '2BAC-SM-A', category: 'lycee', active: true },
  { id: 'niv_seed_2bac-sm-b', name: { fr: '2ème Bac Sciences Maths B', ar: 'الثانية باك علوم رياضية ب' }, code: '2BAC-SM-B', category: 'lycee', active: true },
  { id: 'niv_seed_2bac-eco', name: { fr: '2ème Bac Économie & Gestion', ar: 'الثانية باك اقتصاد وتدبير' }, code: '2BAC-ECO', category: 'lycee', active: true },
  { id: 'niv_seed_2bac-lettres', name: { fr: '2ème Bac Lettres', ar: 'الثانية باك آداب' }, code: '2BAC-LETTRES', category: 'lycee', active: true },
];
