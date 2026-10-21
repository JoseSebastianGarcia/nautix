import { z } from "zod";

/** How long a recreated container gets to prove it works before the old one is dropped. */
export const ApplyGate = z.object({
  /** Without a health check: seconds it must stay up with no restart. */
  settleSeconds: z.number().int().min(1).max(30).default(5),
  /** With a health check: seconds to become healthy. */
  timeoutSeconds: z.number().int().min(5).max(600).default(60),
});
export type ApplyGate = z.infer<typeof ApplyGate>;

const EnvName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/, "invalid variable name");

/** Edits the environment of a container: it is recreated with the new values (see ADR-042). */
export const SetEnv = z
  .object({
    set: z.record(EnvName, z.string().max(8192)).default({}),
    unset: z.array(EnvName).max(100).default([]),
    gate: ApplyGate.optional(),
  })
  .refine((e) => Object.keys(e.set).length + e.unset.length > 0, {
    message: "nothing to change",
  })
  .refine((e) => e.unset.every((k) => !(k in e.set)), {
    message: "a variable cannot be set and removed at once",
  });
export type SetEnv = z.infer<typeof SetEnv>;
export type SetEnvInput = z.input<typeof SetEnv>;
