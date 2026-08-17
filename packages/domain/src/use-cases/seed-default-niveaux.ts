import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import {
  NIVEAU_ID_PREFIX,
  type Niveau,
  type NiveauCategory,
  type NiveauId,
} from '../entities/niveau';

export type SeedDefaultNiveauxInput = {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * The standard Moroccan school-level catalog a fresh center bootstraps
 * (SOU-260): 1AP–6AP, 1AC–3AC, Tronc Commun (3 filières), 1ère Bac (5 filières)
 * and 2ème Bac (6 filières). Codes double as the short labels the UI shows
 * (e.g. `2BAC-SVT`); names are bilingual FR/AR for native RTL rendering. The
 * catalog is reference data only — the center can rename, recode, or deactivate
 * any row afterwards through the manage screen.
 */
export const NIVEAU_SEED_CATALOG: readonly {
  readonly code: string;
  readonly category: NiveauCategory;
  readonly name: { readonly fr: string; readonly ar: string };
}[] = [
  { code: '1AP', category: 'primaire', name: { fr: '1ère Année Primaire', ar: 'السنة الأولى ابتدائي' } },
  { code: '2AP', category: 'primaire', name: { fr: '2ème Année Primaire', ar: 'السنة الثانية ابتدائي' } },
  { code: '3AP', category: 'primaire', name: { fr: '3ème Année Primaire', ar: 'السنة الثالثة ابتدائي' } },
  { code: '4AP', category: 'primaire', name: { fr: '4ème Année Primaire', ar: 'السنة الرابعة ابتدائي' } },
  { code: '5AP', category: 'primaire', name: { fr: '5ème Année Primaire', ar: 'السنة الخامسة ابتدائي' } },
  { code: '6AP', category: 'primaire', name: { fr: '6ème Année Primaire', ar: 'السنة السادسة ابتدائي' } },
  { code: '1AC', category: 'college', name: { fr: '1ère Année Collège', ar: 'السنة الأولى إعدادي' } },
  { code: '2AC', category: 'college', name: { fr: '2ème Année Collège', ar: 'السنة الثانية إعدادي' } },
  { code: '3AC', category: 'college', name: { fr: '3ème Année Collège', ar: 'السنة الثالثة إعدادي' } },
  { code: 'TC-SCIENCES', category: 'lycee', name: { fr: 'Tronc Commun Sciences', ar: 'الجذع المشترك العلمي' } },
  { code: 'TC-LSH', category: 'lycee', name: { fr: 'Tronc Commun Lettres & Sciences Humaines', ar: 'الجذع المشترك الآداب والعلوم الإنسانية' } },
  { code: 'TC-TECHNO', category: 'lycee', name: { fr: 'Tronc Commun Technologique', ar: 'الجذع المشترك التكنولوجي' } },
  { code: '1BAC-SEXP', category: 'lycee', name: { fr: '1ère Bac Sciences Expérimentales', ar: 'الأولى باكالوريا علوم تجريبية' } },
  { code: '1BAC-SM', category: 'lycee', name: { fr: '1ère Bac Sciences Maths', ar: 'الأولى باكالوريا علوم رياضية' } },
  { code: '1BAC-LETTRES', category: 'lycee', name: { fr: '1ère Bac Lettres', ar: 'الأولى باكالوريا آداب' } },
  { code: '1BAC-SECO', category: 'lycee', name: { fr: '1ère Bac Sciences Économiques', ar: 'الأولى باكالوريا علوم اقتصادية' } },
  { code: '1BAC-ST', category: 'lycee', name: { fr: '1ère Bac Sciences & Technologies', ar: 'الأولى باكالوريا علوم وتكنولوجيات' } },
  { code: '2BAC-SVT', category: 'lycee', name: { fr: '2ème Bac Sciences de la Vie et de la Terre', ar: 'الثانية باكالوريا علوم الحياة والأرض' } },
  { code: '2BAC-PC', category: 'lycee', name: { fr: '2ème Bac Sciences Physiques', ar: 'الثانية باكالوريا علوم فيزيائية' } },
  { code: '2BAC-SMA', category: 'lycee', name: { fr: '2ème Bac Sciences Maths A', ar: 'الثانية باكالوريا علوم رياضية أ' } },
  { code: '2BAC-SMB', category: 'lycee', name: { fr: '2ème Bac Sciences Maths B', ar: 'الثانية باكالوريا علوم رياضية ب' } },
  { code: '2BAC-SECO', category: 'lycee', name: { fr: '2ème Bac Sciences Économiques', ar: 'الثانية باكالوريا علوم اقتصادية' } },
  { code: '2BAC-LETTRES', category: 'lycee', name: { fr: '2ème Bac Lettres', ar: 'الثانية باكالوريا آداب' } },
];

/** Builds the initial niveau catalog so it can be committed with the center atomically. */
export function newDefaultNiveaux(
  input: SeedDefaultNiveauxInput,
  clock: Clock,
  ids: IdGenerator,
): readonly Niveau[] {
  return NIVEAU_SEED_CATALOG.map((entry) => ({
    id: ids.next(NIVEAU_ID_PREFIX) as NiveauId,
    ...newEnvelope(
      {
        centerCode: input.centerCode,
        deviceOrigin: input.deviceOrigin,
        updatedBy: input.updatedBy,
      },
      clock,
    ),
    name: { fr: entry.name.fr, ar: entry.name.ar },
    code: entry.code,
    category: entry.category,
    active: true,
  }));
}
