import { z } from "zod";
import { ResourceName } from "./docker.js";
import { cidrContains, isCidr } from "./ip.js";

/** Seconds a changed rule set stays on trial before it is rolled back unless it is confirmed. */
export const GUARD_TRIAL_SECONDS = 60;
/** A helper that has not reported for this long counts as disconnected. */
export const GUARD_HELPER_STALE_SECONDS = 30;

export const GUARD_BACKENDS = ["iptables", "nftables"] as const;
export type GuardBackend = (typeof GUARD_BACKENDS)[number];

export const GuardRule = z.object({
  container: ResourceName,
  /** Port inside the container; the host port it is published on is looked up when the plan is built. */
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp"]).default("tcp"),
  /** Sources allowed to connect. Never empty: an empty list would deny everyone. */
  allow: z.array(z.string().trim().refine(isCidr, "invalid address or CIDR")).min(1).max(64),
  note: z.string().max(200).optional(),
});
export type GuardRule = z.infer<typeof GuardRule>;

const ruleKey = (r: Pick<GuardRule, "container" | "port" | "protocol">): string =>
  `${r.container}/${r.port}/${r.protocol}`;

export const SaveGuardRules = z.object({
  rules: z
    .array(GuardRule)
    .max(200)
    .refine((rs) => new Set(rs.map(ruleKey)).size === rs.length, {
      message: "one rule per container port",
    }),
  /** The user confirmed they understand these rules may cut their own access. */
  acknowledgeLockout: z.boolean().default(false),
});
export type SaveGuardRules = z.infer<typeof SaveGuardRules>;

/** A rule as the helper applies it: the port on the host and who may reach it. */
export interface ResolvedGuardRule {
  hostPort: number;
  protocol: "tcp" | "udp";
  allow: string[];
}

/** What the helper polls: apply `rules`; if `validUntil` passes with no newer plan, apply `fallback`. */
export interface GuardPlanDoc {
  revision: number;
  rules: ResolvedGuardRule[];
  fallback: ResolvedGuardRule[] | null;
  validUntil: string | null;
}

export const GuardReport = z.object({
  revision: z.number().int().min(0),
  backend: z.enum([...GUARD_BACKENDS, "none"]),
  ok: z.boolean(),
  error: z.string().max(2000).optional(),
});
export type GuardReport = z.infer<typeof GuardReport>;

export interface GuardStatus {
  helper: {
    connected: boolean;
    lastSeen: string | null;
    backend: GuardReport["backend"] | null;
    appliedRevision: number | null;
    ok: boolean | null;
    error: string | null;
  };
  tokenSet: boolean;
  revision: number;
  /** Rules currently in force (confirmed), or on trial when `trial` is set. */
  rules: GuardRule[];
  trial: { rules: GuardRule[]; deadline: string } | null;
  /** Rules whose container is stopped or does not publish the port, so nothing is enforced for them. */
  unresolved: GuardRule[];
}

/** Rules that would leave `address` out: the check behind the lock-out warning. */
export const rulesExcluding = (rules: GuardRule[], address: string): GuardRule[] =>
  rules.filter((r) => !r.allow.some((c) => cidrContains(c, address)));

/** One command of a firewall plan: arguments (never a shell string) and optional standard input. */
export interface GuardCommandStep {
  argv: string[];
  stdin?: string;
  /** A file the helper writes before running the command (nft will not read a script from a socket). */
  file?: { path: string; content: string };
  /** Skip the step when this command succeeds (for example `iptables -C` before inserting a jump). */
  unless?: string[];
  /** A failure here is not an error (removing something that is already gone). */
  tolerateFailure?: boolean;
}

/** The commands the helper would run for the current rules, and the ones that undo them. */
export interface GuardPreview {
  apply: GuardCommandStep[];
  remove: GuardCommandStep[];
}
