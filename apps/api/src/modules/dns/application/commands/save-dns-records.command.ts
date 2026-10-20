import type { DnsRecord } from "@nautix/contracts";

export class SaveDnsRecordsCommand {
  constructor(
    readonly container: string,
    readonly records: DnsRecord[],
  ) {}
}
