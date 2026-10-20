import {
  type Container,
  type DnsApplyResult,
  type DnsRecord,
  type DnsServer,
  dnsKind,
  isDnsImage,
  ResourceName,
  SaveDnsRecords,
} from "@nautix/contracts";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";
import { parse } from "../../../shared/zod-body.js";
import { ApplyDnsCommand } from "../../docker/application/commands/apply-dns.command.js";
import { InspectQuery } from "../../docker/application/queries/inspect.query.js";
import { ListContainersQuery } from "../../docker/application/queries/list-containers.query.js";
import { LookupDnsQuery } from "../../docker/application/queries/lookup-dns.query.js";
import { SaveDnsRecordsCommand } from "../application/commands/save-dns-records.command.js";
import { GetDnsRecordsQuery } from "../application/queries/get-dns-records.query.js";

const Host = z.object({ host: z.string().min(1).max(253) });

interface InspectedNetworks {
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string }> };
}

/** DNS containers (editable ones first) and the custom records Nautix writes into them. */
@Controller("api/v1/dns")
export class DnsController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  async servers(): Promise<DnsServer[]> {
    const containers = await this.queries.execute<ListContainersQuery, Container[]>(
      new ListContainersQuery(),
    );
    const found = containers.filter(
      (c) => isDnsImage(c.image) && c.labels["nautix.tunnel"] !== "true",
    );
    const servers = await Promise.all(
      found.map(async (c): Promise<DnsServer> => {
        const ips: Record<string, string> = {};
        if (c.state === "running") {
          const raw = await this.queries
            .execute<InspectQuery, unknown>(new InspectQuery("container", c.id))
            .catch(() => ({}));
          for (const [net, v] of Object.entries(
            (raw as InspectedNetworks).NetworkSettings?.Networks ?? {},
          ))
            if (v.IPAddress) ips[net] = v.IPAddress;
        }
        return {
          id: c.id,
          name: c.name,
          image: c.image,
          kind: dnsKind(c.image),
          state: c.state,
          networks: c.networks,
          ips,
        };
      }),
    );
    return servers.sort(
      (a, b) => Number(b.kind !== null) - Number(a.kind !== null) || a.name.localeCompare(b.name),
    );
  }

  @Get(":name/records")
  records(@Param("name") name: string): Promise<DnsRecord[]> {
    return this.queries.execute(new GetDnsRecordsQuery(parse(ResourceName, name)));
  }

  /** Stores the records; they reach the DNS server with `apply`. */
  @Put(":name/records")
  @HttpCode(204)
  async save(@Param("name") name: string, @Body() body: unknown) {
    await this.commands.execute(
      new SaveDnsRecordsCommand(parse(ResourceName, name), parse(SaveDnsRecords, body).records),
    );
  }

  /** Writes the saved records into the DNS container and restarts it. Also needed after recreating the container. */
  @Post(":name/apply")
  @HttpCode(200)
  async apply(@Param("name") name: string): Promise<DnsApplyResult> {
    const container = parse(ResourceName, name);
    const records = await this.queries.execute<GetDnsRecordsQuery, DnsRecord[]>(
      new GetDnsRecordsQuery(container),
    );
    return this.commands.execute<ApplyDnsCommand, DnsApplyResult>(
      new ApplyDnsCommand(container, records),
    );
  }

  /** What the DNS server answers for a name (asked from inside its own container). */
  @Get(":name/lookup")
  lookup(@Param("name") name: string, @Query() query: unknown): Promise<DnsApplyResult> {
    return this.queries.execute(
      new LookupDnsQuery(parse(ResourceName, name), parse(Host, query).host),
    );
  }
}
