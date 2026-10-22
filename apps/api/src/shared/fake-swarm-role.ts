import type { SwarmRole } from "@nautix/contracts";

/**
 * The demo engine is two classes (docker and swarm) that must agree on whether this node is in a swarm.
 * This is the one bit of state they share; the real engine asks the daemon instead.
 */
let role: SwarmRole = "none";

export const getFakeSwarmRole = (): SwarmRole => role;
export const setFakeSwarmRole = (next: SwarmRole): void => {
  role = next;
};
