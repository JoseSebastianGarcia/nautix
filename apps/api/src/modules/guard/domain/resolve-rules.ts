import type { Container, GuardRule, ResolvedGuardRule } from "@nautix/contracts";

export interface Resolution {
  resolved: ResolvedGuardRule[];
  /** Rules with nothing to enforce yet: the container is gone, stopped or does not publish the port. */
  unresolved: GuardRule[];
}

/** Rules name a container and its own port; the firewall needs the host port Docker published. */
export const resolveGuardRules = (
  rules: GuardRule[],
  containers: Pick<Container, "name" | "ports">[],
): Resolution => {
  const resolved: ResolvedGuardRule[] = [];
  const unresolved: GuardRule[] = [];
  for (const rule of rules) {
    const container = containers.find((c) => c.name === rule.container);
    const hostPort = container?.ports.find(
      (p) => p.privatePort === rule.port && p.type === rule.protocol && p.publicPort !== undefined,
    )?.publicPort;
    if (hostPort === undefined) unresolved.push(rule);
    else resolved.push({ hostPort, protocol: rule.protocol, allow: rule.allow });
  }
  return { resolved, unresolved };
};
