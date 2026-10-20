import type { DnsEntry } from "@nautix/contracts";

export class SaveDnsRecordsCommand {
  constructor(
    readonly container: string,
    readonly records: DnsEntry[],
  ) {}
}
