import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DnsRecordsRepository } from "../ports/dns-records-repository.js";
import { SaveDnsRecordsCommand } from "./save-dns-records.command.js";

@CommandHandler(SaveDnsRecordsCommand)
export class SaveDnsRecordsHandler implements ICommandHandler<SaveDnsRecordsCommand, void> {
  constructor(@Inject(DnsRecordsRepository) private readonly records: DnsRecordsRepository) {}

  execute({ container, records }: SaveDnsRecordsCommand): Promise<void> {
    return this.records.save(container, records);
  }
}
