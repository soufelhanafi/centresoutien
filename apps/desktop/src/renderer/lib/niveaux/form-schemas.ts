import { z } from 'zod';
import { groupInputSchema, studentInputSchema, teacherInputSchema } from '@centresoutien/domain';

// TEMP (SOU-260): the domain-backend merge adds `niveauId` to the student and
// group input schemas and `niveauIds` to the teacher input schema. Until then
// these local extensions give the forms a typed `niveauId`/`niveauIds` field
// whose payload the existing create/update channels accept structurally. When
// the domain schemas land, delete this file and let the forms validate against
// the domain's own schemas directly.

const niveauIdField = z
  .string()
  .nullable()
  .default(null);

const niveauIdsField = z.array(z.string()).default([]);

export const studentNiveauFormSchema = studentInputSchema.extend({ niveauId: niveauIdField });
export type StudentNiveauFormInput = z.input<typeof studentNiveauFormSchema>;
export type StudentNiveauFormValues = z.output<typeof studentNiveauFormSchema>;

export const groupNiveauFormSchema = groupInputSchema.extend({ niveauId: niveauIdField });
export type GroupNiveauFormInput = z.input<typeof groupNiveauFormSchema>;
export type GroupNiveauFormValues = z.output<typeof groupNiveauFormSchema>;

export const teacherNiveauFormSchema = teacherInputSchema.extend({ niveauIds: niveauIdsField });
export type TeacherNiveauFormInput = z.input<typeof teacherNiveauFormSchema>;
export type TeacherNiveauFormValues = z.output<typeof teacherNiveauFormSchema>;
