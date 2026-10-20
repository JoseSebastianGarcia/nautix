import { DNS_KINDS, type DnsKind } from "@nautix/contracts";
import type { DnsStrategy } from "../dns-strategy.js";
import { CorednsStrategy } from "./coredns.strategy.js";
import { DnsmasqStrategy } from "./dnsmasq.strategy.js";

const STRATEGIES: Record<DnsKind, DnsStrategy> = {
  dnsmasq: new DnsmasqStrategy(),
  coredns: new CorednsStrategy(),
};

/** Registry: the only place that knows which DNS adapters exist. */
export const dnsStrategyFor = (kind: DnsKind): DnsStrategy => STRATEGIES[kind];

export const supportedDnsKinds = (): readonly DnsKind[] => DNS_KINDS;
