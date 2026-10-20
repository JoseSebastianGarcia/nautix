import type { DnsEntry } from "@nautix/contracts";

export abstract class DnsRecordsRepository {
  abstract get(container: string): Promise<DnsEntry[]>;
  abstract save(container: string, records: DnsEntry[]): Promise<void>;
}
