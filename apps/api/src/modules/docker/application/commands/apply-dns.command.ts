import type { DnsEntry } from "@nautix/contracts";

export class ApplyDnsCommand {
  constructor(
    readonly container: string,
    readonly records: DnsEntry[],
  ) {}
}
