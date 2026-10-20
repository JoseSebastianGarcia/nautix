import type { DnsRecord } from "@nautix/contracts";

export class ApplyDnsCommand {
  constructor(
    readonly container: string,
    readonly records: DnsRecord[],
  ) {}
}
