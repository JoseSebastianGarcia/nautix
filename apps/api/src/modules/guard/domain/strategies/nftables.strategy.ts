import type { ResolvedGuardRule } from "@nautix/contracts";
import { type GuardPlan, GuardStrategy, ofFamily } from "../guard-strategy.js";

export const TABLE = "nautix_guard";
const SCRIPT_PATH = "/tmp/nautix-guard.nft";

/**
 * One `inet` table with a forward hook that runs before Docker's own chains. A rule drops traffic
 * to a published port unless the source is listed; a port with no entry of one IP family drops
 * that whole family.
 */
export const buildNftScript = (rules: ResolvedGuardRule[]): string => {
  const lines = [
    `add table inet ${TABLE}`,
    `delete table inet ${TABLE}`,
    `table inet ${TABLE} {`,
    "  chain forward {",
    "    type filter hook forward priority -1; policy accept;",
    "    ct state established,related accept",
  ];
  for (const rule of rules) {
    for (const [family, nf, saddr] of [
      [4, "ipv4", "ip saddr"],
      [6, "ipv6", "ip6 saddr"],
    ] as const) {
      const listed = ofFamily(rule.allow, family);
      const source = listed.length > 0 ? ` ${saddr} != { ${listed.join(", ")} }` : "";
      lines.push(
        `    meta nfproto ${nf} meta l4proto ${rule.protocol} ct original proto-dst ${rule.hostPort}${source} drop`,
      );
    }
  }
  lines.push("  }", "}", "");
  return lines.join("\n");
};

/** nftables: the whole table is replaced in one atomic `nft -f <file>`. */
export class NftablesStrategy extends GuardStrategy {
  readonly kind = "nftables" as const;

  plan(rules: ResolvedGuardRule[]): GuardPlan {
    return {
      apply: [
        {
          argv: ["nft", "-f", SCRIPT_PATH],
          file: { path: SCRIPT_PATH, content: buildNftScript(rules) },
        },
      ],
      remove: [{ argv: ["nft", "delete", "table", "inet", TABLE], tolerateFailure: true }],
    };
  }
}
