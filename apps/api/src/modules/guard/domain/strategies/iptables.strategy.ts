import type { ResolvedGuardRule } from "@nautix/contracts";
import { type GuardPlan, type GuardStep, GuardStrategy, ofFamily } from "../guard-strategy.js";

export const CHAIN = "NAUTIX-GUARD";
const HOOK = "DOCKER-USER";

/**
 * Content of the Nautix chain for one IP family, in `iptables-restore` format. Matching on the
 * original destination port (`ctorigdstport`) is what makes it work after Docker's NAT, which has
 * already rewritten the address and port by the time `DOCKER-USER` sees the packet.
 */
export const buildIptablesRestore = (rules: ResolvedGuardRule[], family: 4 | 6): string => {
  const lines = ["*filter", `:${CHAIN} - [0:0]`, `-F ${CHAIN}`];
  lines.push(`-A ${CHAIN} -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN`);
  for (const rule of rules) {
    const match = `-A ${CHAIN} -p ${rule.protocol} -m conntrack --ctorigdstport ${rule.hostPort} --ctdir ORIGINAL`;
    for (const source of ofFamily(rule.allow, family))
      lines.push(`${match} -s ${source} -j RETURN`);
    lines.push(`${match} -j DROP`);
  }
  lines.push(`-A ${CHAIN} -j RETURN`, "COMMIT", "");
  return lines.join("\n");
};

/** iptables (legacy or nft front end) and ip6tables: the `NAUTIX-GUARD` chain, jumped to from `DOCKER-USER`. */
export class IptablesStrategy extends GuardStrategy {
  readonly kind = "iptables" as const;

  plan(rules: ResolvedGuardRule[]): GuardPlan {
    const apply: GuardStep[] = [];
    const remove: GuardStep[] = [];
    for (const [family, bin, restore] of [
      [4, "iptables", "iptables-restore"],
      [6, "ip6tables", "ip6tables-restore"],
    ] as const) {
      apply.push(
        { argv: [bin, "-N", CHAIN], tolerateFailure: true },
        {
          argv: [bin, "-I", HOOK, "1", "-j", CHAIN],
          unless: [bin, "-C", HOOK, "-j", CHAIN],
        },
        { argv: [restore, "-n"], stdin: buildIptablesRestore(rules, family) },
      );
      remove.push(
        { argv: [bin, "-D", HOOK, "-j", CHAIN], tolerateFailure: true },
        { argv: [bin, "-F", CHAIN], tolerateFailure: true },
        { argv: [bin, "-X", CHAIN], tolerateFailure: true },
      );
    }
    return { apply, remove };
  }
}
