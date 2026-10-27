import { z } from "zod";
import { Name } from "./common.ts";

/** Header an admin sends to read or write inside another account's library. */
export const ACT_AS_HEADER = "X-Magpie-Act-As";

/** The built-in admin account (the one behind API_TOKEN): its role is fixed and it cannot be deleted. */
export const ROOT_ADMIN_ID = "00000000-0000-7000-8000-000000000001";

/** Default per-account storage limit: 50 GB (1 GB = 1024^3 bytes, like the sizes the app shows). */
export const DEFAULT_STORAGE_LIMIT_BYTES = 50 * 1024 ** 3;

/** Bytes an account has stored (original media files; thumbnails are not counted) against its limit. */
export const Storage = z.object({
  usedBytes: z.number().int().nonnegative(),
  /** Null means unlimited. */
  limitBytes: z.number().int().positive().nullable(),
});
export type Storage = z.infer<typeof Storage>;

export const User = z.object({
  id: z.uuid(),
  /** Username: set by the admin at creation and fixed. */
  name: z.string(),
  /** Chosen by the account owner for visibility; null means "show the username". */
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
  /** False while the generated token has not been exchanged for a password yet (an invite still pending). Absent on older servers. */
  hasPassword: z.boolean().optional(),
  /** The built-in admin (API_TOKEN): its role cannot change and it cannot be deleted. */
  isRoot: z.boolean(),
  createdAt: z.iso.datetime(),
  itemCount: z.number().int().nonnegative(),
  /** Absent on servers that predate storage limits. */
  storage: Storage.optional(),
});
export type User = z.infer<typeof User>;

export const UsersResponse = z.object({ users: z.array(User) });
export type UsersResponse = z.infer<typeof UsersResponse>;

export const roles = ["user", "admin"] as const;
export const Role = z.enum(roles);
export type Role = z.infer<typeof Role>;

/** The username is fixed; the role is chosen at creation and can be changed by an admin later. */
export const CreateUserBody = z.object({ name: Name.max(100), role: Role.default("user") });
export type CreateUserBody = z.infer<typeof CreateUserBody>;

/** At least one field; `storageLimitBytes: null` removes the limit. */
export const UpdateUserBody = z
  .object({ role: Role.optional(), storageLimitBytes: z.number().int().positive().nullable().optional() })
  .refine((b) => b.role !== undefined || b.storageLimitBytes !== undefined, { message: "Nothing to change" });
export type UpdateUserBody = z.infer<typeof UpdateUserBody>;

/** `PATCH /me`: only the display name can change; the username is fixed. */
export const UpdateMeBody = z.object({ displayName: Name.max(100).nullable() });
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;

/** `DELETE /me`: typing the username is the confirmation. */
export const DeleteMeBody = z.object({ confirm: z.string().min(1).max(100) });
export type DeleteMeBody = z.infer<typeof DeleteMeBody>;

/** The token is shown once; only its hash is stored. */
/** `PUT /me/password`: `token` is null when the caller's current token stays valid (the root admin's API_TOKEN). */
export const PasswordResponse = z.object({ token: z.string().nullable(), me: z.lazy(() => MeResponse) });
export type PasswordResponse = z.infer<typeof PasswordResponse>;

export const CreateUserResponse = z.object({ user: User, token: z.string() });
export type CreateUserResponse = z.infer<typeof CreateUserResponse>;

export const RotateTokenResponse = z.object({ token: z.string() });
export type RotateTokenResponse = z.infer<typeof RotateTokenResponse>;

/** Passwords are optional and only unlock username + password login; the generated token always works. */
export const MIN_PASSWORD_LENGTH = 10;

export const SetPasswordBody = z.object({ password: z.string().min(MIN_PASSWORD_LENGTH).max(200) });
export type SetPasswordBody = z.infer<typeof SetPasswordBody>;

export const LoginBody = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });
export type LoginBody = z.infer<typeof LoginBody>;

export const AccountRef = z.object({ id: z.uuid(), name: z.string(), displayName: z.string().nullable() });
export type AccountRef = z.infer<typeof AccountRef>;

/** `GET /me`: who the token belongs to, and whose library the request is working in. */
export const MeResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  displayName: z.string().nullable(),
  isAdmin: z.boolean(),
  /** True once the account owner has set a password. */
  hasPassword: z.boolean(),
  /** Set when an admin sent `X-Magpie-Act-As`. */
  actingAs: AccountRef.nullable(),
  /** Storage of the library the request works in (the acted-as account for an admin). Only sent by `GET /me`; absent on older servers. */
  storage: Storage.optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/** What to show for an account: the display name if they set one, else the username. */
export const accountLabel = (a: { name: string; displayName: string | null }): string => a.displayName ?? a.name;

/** `POST /auth/login`: a session token for this device, to be used like any bearer token. */
export const LoginResponse = z.object({ token: z.string(), me: MeResponse });
export type LoginResponse = z.infer<typeof LoginResponse>;
