import { z } from "zod";

export const Password = z.string().min(10).max(200);

export const SetupRequest = z.object({
  setupToken: z.string().min(1),
  username: z.string().regex(/^[a-zA-Z0-9_.-]{3,32}$/),
  password: Password,
});
export type SetupRequest = z.infer<typeof SetupRequest>;

export const LoginRequest = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const Role = z.enum(["admin", "viewer"]);
export type Role = z.infer<typeof Role>;

export const Session = z.object({
  authenticated: z.boolean(),
  setupRequired: z.boolean(),
  username: z.string().nullable(),
  role: Role.nullable(),
});
export type Session = z.infer<typeof Session>;

export const Problem = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  code: z.string(),
  hintKey: z.string().optional(),
  detail: z.string().optional(),
});
export type Problem = z.infer<typeof Problem>;

export const Username = z.string().regex(/^[a-zA-Z0-9_.-]{3,32}$/);

export const CreateUser = z.object({ username: Username, password: Password, role: Role });
export type CreateUser = z.infer<typeof CreateUser>;

export const UserInfo = z.object({ id: z.string(), username: z.string(), role: Role });
export type UserInfo = z.infer<typeof UserInfo>;

export const CreateToken = z.object({ name: z.string().min(1).max(64), role: Role });
export type CreateToken = z.infer<typeof CreateToken>;

export const ApiTokenInfo = z.object({
  id: z.string(),
  name: z.string(),
  role: Role,
  createdAt: z.number(),
  lastUsedAt: z.number().nullable(),
});
export type ApiTokenInfo = z.infer<typeof ApiTokenInfo>;
