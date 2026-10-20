import { Readable } from "node:stream";
import { type DnsApplyResult, dnsKind } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { buildDnsmasqConfig, DNSMASQ_DIR, DNSMASQ_SCRIPT } from "../../domain/dns-config.js";
import { buildTar } from "../../domain/tar.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { ApplyDnsCommand } from "./apply-dns.command.js";

const COMMAND_MS = 20_000;

/**
 * Writes the records into the DNS container, checks them with dnsmasq's own syntax test and
 * restarts the container (dnsmasq reads its configuration only at start).
 */
@CommandHandler(ApplyDnsCommand)
export class ApplyDnsHandler implements ICommandHandler<ApplyDnsCommand, DnsApplyResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ container, records }: ApplyDnsCommand): Promise<DnsApplyResult> {
    const server = (await this.engine.listContainers()).find(
      (c) => c.id === container || c.name === container,
    );
    if (!server) throw new NotFoundError("DNS container not found", "errors.notFound");
    if (!dnsKind(server.image))
      throw new ValidationError("this container is not an editable DNS server", "errors.notDns");
    if (server.state !== "running")
      throw new ConflictError("the DNS container is not running", "errors.dnsNotRunning");

    const content = buildDnsmasqConfig(records); // validates every record first
    await this.engine.putArchive(
      server.id,
      "/",
      Readable.from([buildTar([{ path: `${DNSMASQ_DIR}/nautix.conf.new`, content }])]),
    );
    const checked = await this.engine.runCommand(
      server.id,
      ["sh", "-c", DNSMASQ_SCRIPT],
      COMMAND_MS,
    );
    if (checked.exitCode !== 0) return { ok: false, output: checked.output.trim() };
    await this.engine.containerAction(server.id, "restart");
    return { ok: true, output: checked.output.trim() };
  }
}
