import type { DnsRecord } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DnsRecordsRepository } from "../ports/dns-records-repository.js";
import { GetDnsRecordsQuery } from "./get-dns-records.query.js";

@QueryHandler(GetDnsRecordsQuery)
export class GetDnsRecordsHandler implements IQueryHandler<GetDnsRecordsQuery, DnsRecord[]> {
  constructor(@Inject(DnsRecordsRepository) private readonly records: DnsRecordsRepository) {}

  execute({ container }: GetDnsRecordsQuery): Promise<DnsRecord[]> {
    return this.records.get(container);
  }
}
