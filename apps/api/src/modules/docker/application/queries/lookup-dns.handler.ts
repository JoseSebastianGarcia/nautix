import { randomBytes } from "node:crypto";
import { type DnsApplyResult, dnsKind, HOSTNAME } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import type { EngineContainerSpec } from "../../domain/container-spec.js";
import { VOLUME_HELPER_IMAGE } from "../../domain/volume-browse.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { LookupDnsQuery } from "./lookup-dns.query.js";

const WAIT_MS = 15_000;

/**
 * Asks the DNS server the way a client does: a short-lived container joins the server's network and
 * runs `nslookup host <server ip>`. This works for every DNS server (even those with no shell inside)
 * and also proves the server is reachable from that network.
 */
@QueryHandler(LookupDnsQuery)
export class LookupDnsHandler implements IQueryHandler<LookupDnsQuery, DnsApplyResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ container, host }: LookupDnsQuery): Promise<DnsApplyResult> {
    if (!HOSTNAME.test(host))
      throw new ValidationError("invalid domain name", "errors.dnsInvalidRecord");
    const [containers, networks] = await Promise.all([
      this.engine.listContainers(),
      this.engine.listNetworks(),
    ]);
    const server = containers.find((c) => c.id === container || c.name === container);
    if (!server) throw new NotFoundError("DNS container not found", "errors.notFound");
    if (!dnsKind(server.image))
      throw new ValidationError("this container is not an editable DNS server", "errors.notDns");
    if (server.state !== "running")
      throw new ConflictError("the DNS container is not running", "errors.dnsNotRunning");

    // Prefer a network the user created; the default bridge works too.
    const names = Object.keys(server.ips ?? {});
    const network = names.find((n) => networks.some((x) => x.name === n && !x.system)) ?? names[0];
    const ip = network ? server.ips?.[network] : undefined;
    if (!network || !ip)
      throw new ConflictError("the DNS container has no address", "errors.dnsNoAddress");

    const spec: EngineContainerSpec = {
      name: `nautix-lookup-${randomBytes(4).toString("hex")}`,
      image: VOLUME_HELPER_IMAGE,
      env: [],
      labels: { "nautix.managed": "true", "nautix.helper": "dns-lookup" },
      cmd: ["nslookup", host, ip],
      exposedPorts: {},
      portBindings: {},
      binds: [],
      restartPolicy: "no",
      networkName: network,
    };
    await this.engine.pullImageIfMissing(VOLUME_HELPER_IMAGE);
    const helper = await this.engine.createContainer(spec);
    try {
      await this.engine.containerAction(helper.id, "start");
      const waited = await this.engine.waitContainer(helper.id, WAIT_MS);
      const output = (await this.engine.containerLogs(helper.id, 50)).trim();
      return { ok: waited.exited && waited.statusCode === 0, output };
    } finally {
      await this.engine.removeContainer(helper.id, true).catch(() => undefined);
    }
  }
}
