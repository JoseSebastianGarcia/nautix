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

export const Session = z.object({
  authenticated: z.boolean(),
  setupRequired: z.boolean(),
  username: z.string().nullable(),
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
