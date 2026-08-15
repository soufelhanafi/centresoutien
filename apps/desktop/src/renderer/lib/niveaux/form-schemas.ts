import { groupInputSchema, studentInputSchema, teacherInputSchema } from '@centresoutien/domain';
import type { z } from 'zod';

// SOU-260: the domain schemas now carry the level-taxonomy fields natively —
// `studentInputSchema.niveauId`, `groupInputSchema.niveauId`, and
// `teacherInputSchema.niveauIds` — so the form types are direct aliases of the
// domain schemas (the earlier local extension is gone with the merge).

export const studentNiveauFormSchema = studentInputSchema;
export type StudentNiveauFormInput = z.input<typeof studentNiveauFormSchema>;
export type StudentNiveauFormValues = z.output<typeof studentNiveauFormSchema>;

export const groupNiveauFormSchema = groupInputSchema;
export type GroupNiveauFormInput = z.input<typeof groupNiveauFormSchema>;
export type GroupNiveauFormValues = z.output<typeof groupNiveauFormSchema>;

export const teacherNiveauFormSchema = teacherInputSchema;
export type TeacherNiveauFormInput = z.input<typeof teacherNiveauFormSchema>;
export type TeacherNiveauFormValues = z.output<typeof teacherNiveauFormSchema>;
