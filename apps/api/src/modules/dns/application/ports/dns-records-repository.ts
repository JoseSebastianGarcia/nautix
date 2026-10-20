import type { DnsRecord } from "@nautix/contracts";

export abstract class DnsRecordsRepository {
  abstract get(container: string): Promise<DnsRecord[]>;
  abstract save(container: string, records: DnsRecord[]): Promise<void>;
}
