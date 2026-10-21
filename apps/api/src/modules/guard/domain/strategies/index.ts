import type { GuardBackend } from "@nautix/contracts";
import type { GuardStrategy } from "../guard-strategy.js";
import { IptablesStrategy } from "./iptables.strategy.js";
import { NftablesStrategy } from "./nftables.strategy.js";

const STRATEGIES: readonly GuardStrategy[] = [new IptablesStrategy(), new NftablesStrategy()];

export const guardStrategyFor = (kind: GuardBackend): GuardStrategy => {
  const found = STRATEGIES.find((s) => s.kind === kind);
  if (!found) throw new Error(`no guard strategy for ${kind}`);
  return found;
};

export const supportedGuardBackends = (): GuardBackend[] => STRATEGIES.map((s) => s.kind);
