import type { Container, Network } from "@nautix/contracts";

export interface MoveStep {
  op: "connect" | "disconnect";
  networkId: string;
  networkName: string;
}

/**
 * Steps to move a container between zones (network boxes), always connect before disconnect so
 * the container is never left without a network mid-move. Entering a user network also leaves the
 * default bridge, otherwise it would keep a route out and the box's isolation would mean nothing.
 */
export const planMove = (
  container: Container,
  networks: Network[],
  from: Network | null,
  to: Network | null,
): MoveStep[] => {
  const bridge = networks.find((n) => n.name === "bridge");
  const target = to ?? bridge;
  const steps: MoveStep[] = [];
  const step = (op: MoveStep["op"], n: Network): MoveStep => ({
    op,
    networkId: n.id,
    networkName: n.name,
  });

  if (target && !container.networks.includes(target.name)) steps.push(step("connect", target));
  if (from && from.id !== target?.id && container.networks.includes(from.name))
    steps.push(step("disconnect", from));
  if (to && bridge && container.networks.includes(bridge.name))
    steps.push(step("disconnect", bridge));
  return steps;
};
