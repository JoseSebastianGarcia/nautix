import { type DnsApplyResult, dnsKind, HOSTNAME } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { LookupDnsQuery } from "./lookup-dns.query.js";

/** Asks the DNS server itself (`nslookup host 127.0.0.1` inside its container) what it answers. */
@QueryHandler(LookupDnsQuery)
export class LookupDnsHandler implements IQueryHandler<LookupDnsQuery, DnsApplyResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ container, host }: LookupDnsQuery): Promise<DnsApplyResult> {
    if (!HOSTNAME.test(host))
      throw new ValidationError("invalid domain name", "errors.dnsInvalidRecord");
    const server = (await this.engine.listContainers()).find(
      (c) => c.id === container || c.name === container,
    );
    if (!server) throw new NotFoundError("DNS container not found", "errors.notFound");
    if (!dnsKind(server.image))
      throw new ValidationError("this container is not an editable DNS server", "errors.notDns");
    if (server.state !== "running")
      throw new ConflictError("the DNS container is not running", "errors.dnsNotRunning");
    const out = await this.engine.runCommand(server.id, ["nslookup", host, "127.0.0.1"], 10_000);
    return { ok: out.exitCode === 0, output: out.output.trim() };
  }
}
