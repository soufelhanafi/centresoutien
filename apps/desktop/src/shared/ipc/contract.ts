import { z } from 'zod';
import {
  subjectInputSchema,
  studentInputSchema,
  adminCredentialsSchema,
  weeklyHoursSchema,
  loginInputSchema,
  centerProfileSchema,
  PASSWORD_MAX,
  CENTER_LOGO_PATH_MAX,
} from '@centresoutien/domain';

/** The center profile as it crosses the IPC boundary — envelope dates stay in main. */
const centerDto = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  logoPath: z.string().nullable(),
  plan: z.enum(['essentiel', 'pro', 'premium']),
});

// The presentation projection of a Student across the IPC boundary — the sync
// envelope (version, deviceOrigin, updatedBy…) is stripped and Dates are
// serialized to strings, exactly like `centerDto`. `archived` is derived from
// `deletedAt != null` in main; the renderer never sees the raw entity. This is
// the single source of truth for the renderer's `StudentView` type.
const studentViewSchema = z.object({
  id: z.string(),
  name: z.object({ fr: z.string(), ar: z.string() }),
  birthDate: z.string(),
  level: z.string(),
  school: z.string().nullable(),
  notes: z.string().nullable(),
  guardianIds: z.array(z.string()),
  archived: z.boolean(),
  createdAt: z.string(),
});

// The display shape of one weekday's hours returned to the renderer: the
// user-visible fields only, envelope stripped. `open`/`close` are `'HH:mm'` or
// null (closed). Reused by both centerHours responses.
const centerHoursViewSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  open: z.string().nullable(),
  close: z.string().nullable(),
});

/**
 * The typed IPC contract (SOU-15). Every renderer↔main call is a named channel
 * with a zod request AND response schema, validated on both ends. Adding a
 * method = one entry here; main provides the handler, the preload bridge and
 * renderer get their types for free.
 */
export const ipcContract = {
  'app.ping': {
    request: z.object({ message: z.string() }),
    response: z.object({ reply: z.string(), appVersion: z.string() }),
  },
  'plan.get': {
    request: z.object({}),
    response: z.object({ planId: z.enum(['essentiel', 'pro', 'premium']) }),
  },
  // The request schema is the domain's own input schema — validated once, shared
  // by the form (zodResolver), the preload types, and this boundary.
  'subject.create': {
    request: subjectInputSchema,
    response: z.object({ id: z.string() }),
  },
  // The request is the domain's own input schema — validated once, shared by the
  // form (zodResolver), the preload types, and this boundary. centerCode/device/
  // user are injected in main, never sent from the renderer.
  'student.create': {
    request: studentInputSchema,
    response: z.object({ id: z.string() }),
  },
  // Student reads/writes (SOU-39). `list` filters by an FR/AR name-or-level search
  // (centerCode is injected in main); `get` returns the single view or null for an
  // unknown/archived id; `update` takes the domain's own input schema plus the id
  // and echoes the saved view; `archive` is a soft delete. All strip the envelope
  // to `studentViewSchema`, like the center channels.
  'student.list': {
    request: z.object({ search: z.string() }),
    response: z.object({ students: z.array(studentViewSchema) }),
  },
  'student.get': {
    request: z.object({ id: z.string() }),
    response: z.object({ student: studentViewSchema.nullable() }),
  },
  'student.update': {
    request: studentInputSchema.extend({ id: z.string() }),
    response: z.object({ student: studentViewSchema }),
  },
  'student.archive': {
    request: z.object({ id: z.string() }),
    response: z.object({ ok: z.literal(true) }),
  },
  // Auth (SOU-26). `admin.exists` drives first-run detection; `admin.create`
  // reuses the domain credential schema (password policy enforced here too);
  // `admin.verify` is a bare presence check — login must not reject an existing
  // account just because the password policy later tightened. It only bounds
  // length (a correct password can never exceed `PASSWORD_MAX`, so a longer
  // input is always wrong) to keep unbounded strings off the Argon2 path.
  'admin.exists': {
    request: z.object({}),
    response: z.object({ exists: z.boolean() }),
  },
  'admin.create': {
    request: adminCredentialsSchema,
    response: z.object({ id: z.string() }),
  },
  'admin.verify': {
    request: z.object({
      username: z.string().trim().min(1),
      password: z.string().min(1).max(PASSWORD_MAX),
    }),
    response: z.object({ valid: z.boolean() }),
  },
  // Center opening hours (SOU-29). `get` returns only persisted rows (empty on a
  // fresh center — the renderer seeds from the domain's DEFAULT_WEEKLY_HOURS).
  // `save` takes the whole 7-row week (the domain's own schema) and echoes back
  // the saved rows; centerCode/device/user are injected in main, never sent.
  'centerHours.get': {
    request: z.object({}),
    response: z.object({ week: z.array(centerHoursViewSchema) }),
  },
  'centerHours.save': {
    request: weeklyHoursSchema,
    response: z.object({ week: z.array(centerHoursViewSchema) }),
  },
  // Login (SOU-27). `auth.login` is the throttled entry point: it counts failed
  // attempts, enforces the 5-try / 15-minute lockout, and — when the "remember
  // this device" toggle is on — persists a session. The response is a
  // discriminated union so the screen can render its three states without
  // guessing; `Date`s are serialized to epoch millis for the boundary.
  'auth.login': {
    request: loginInputSchema,
    response: z.discriminatedUnion('outcome', [
      z.object({ outcome: z.literal('success') }),
      z.object({
        outcome: z.literal('invalid-credentials'),
        remainingAttempts: z.number().int().nonnegative(),
      }),
      z.object({
        outcome: z.literal('locked-out'),
        lockedUntilMs: z.number().int().nonnegative(),
      }),
    ]),
  },
  // `auth.session` answers "is this device still remembered?" on startup;
  // `auth.logout` forgets it. Neither exposes the session id to the renderer.
  'auth.session': {
    request: z.object({}),
    response: z.object({ authenticated: z.boolean() }),
  },
  'auth.logout': {
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
  },
  // Center profile (SOU-28). `center.get` returns the single row (or null before
  // first save). `center.save` upserts the editable profile fields — the request
  // is the domain's own `centerProfileSchema` plus the `logoPath` produced by a
  // prior `center.saveLogo` upload. `plan` is never accepted here (display-only,
  // seeded once at creation). `center.saveLogo` writes the picked file's bytes
  // under app data and returns the relative path to carry in the next save.
  'center.get': {
    request: z.object({}),
    response: z.object({ center: centerDto.nullable() }),
  },
  'center.save': {
    request: centerProfileSchema.extend({
      logoPath: z.string().max(CENTER_LOGO_PATH_MAX).nullable(),
    }),
    response: z.object({ center: centerDto }),
  },
  'center.saveLogo': {
    request: z.object({
      bytes: z.instanceof(Uint8Array),
      extension: z.string(),
    }),
    response: z.object({ path: z.string() }),
  },
  // `center.logoBytes` reads back a stored logo so the renderer can re-display it
  // after a reload (the row keeps only the relative path, not the bytes). The data
  // adapter guards against path traversal and returns `null` for an unknown or
  // stale reference, so a missing logo is a normal, non-erroring response.
  'center.logoBytes': {
    request: z.object({ path: z.string().max(CENTER_LOGO_PATH_MAX) }),
    // `z.custom<Uint8Array>` (not `z.instanceof`) so the inferred type stays the
    // library-default `Uint8Array` the domain port returns — `z.instanceof`
    // narrows to `Uint8Array<ArrayBuffer>` and rejects `ArrayBufferLike`-backed bytes.
    response: z.object({
      bytes: z.custom<Uint8Array>((v) => v instanceof Uint8Array).nullable(),
    }),
  },
} as const;

/** The Student boundary DTO — the renderer's `StudentView` is an alias of this. */
export type StudentDto = z.infer<typeof studentViewSchema>;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

export type IpcHandlers = {
  [C in IpcChannel]: (request: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>;
};

export function isIpcChannel(value: string): value is IpcChannel {
  return Object.prototype.hasOwnProperty.call(ipcContract, value);
}
