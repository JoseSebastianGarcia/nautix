import { Readable } from "node:stream";
import { type DnsApplyResult, type DnsEntry, type DnsRecord, dnsKind } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import { dnsStrategyFor } from "../../domain/dns-strategies/index.js";
import type { DnsApply } from "../../domain/dns-strategy.js";
import { buildTar } from "../../domain/tar.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { ApplyDnsCommand } from "./apply-dns.command.js";

const COMMAND_MS = 20_000;
const POLL_MS = 500;

/**
 * Delivers the records to a DNS container, whatever its type: the adapter (see dns-strategies)
 * says which files to write, what to check, and whether the server is restarted or reloads itself.
 */
@CommandHandler(ApplyDnsCommand)
export class ApplyDnsHandler implements ICommandHandler<ApplyDnsCommand, DnsApplyResult> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ container, records }: ApplyDnsCommand): Promise<DnsApplyResult> {
    const server = (await this.engine.listContainers()).find(
      (c) => c.id === container || c.name === container,
    );
    if (!server) throw new NotFoundError("DNS container not found", "errors.notFound");
    const kind = dnsKind(server.image);
    if (!kind)
      throw new ValidationError("this container is not an editable DNS server", "errors.notDns");
    const strategy = dnsStrategyFor(kind);
    const running = server.state === "running";
    if (!running && !strategy.writesWhileStopped)
      throw new ConflictError("the DNS container is not running", "errors.dnsNotRunning");

    const plan = strategy.plan(
      this.resolve(records, server.networks, await this.engine.listContainers()),
    );
    const since = Math.floor(Date.now() / 1000);
    await this.engine.putArchive(server.id, "/", Readable.from([buildTar(plan.files)]));
    const outputs: string[] = [];
    for (const command of plan.commands) {
      const out = await this.engine.runCommand(server.id, command, COMMAND_MS);
      if (out.output.trim()) outputs.push(out.output.trim());
      if (out.exitCode !== 0) return { ok: false, output: outputs.join("\n") };
    }
    if (!running) {
      await this.engine.containerAction(server.id, "start");
      return { ok: true, output: outputs.join("\n") };
    }
    return this.finish(server.id, plan.apply, since, outputs);
  }

  /** Turns container targets into their current IPv4: a network shared with the DNS server first. */
  private resolve(
    entries: DnsEntry[],
    serverNetworks: string[],
    containers: { name: string; ips?: Record<string, string> | undefined }[],
  ): DnsRecord[] {
    return entries.map((entry) => {
      if ("ip" in entry) return entry;
      const target = containers.find((c) => c.name === entry.container);
      if (!target)
        throw new ValidationError(
          `container "${entry.container}" (used by ${entry.name}) does not exist`,
          "errors.dnsTargetMissing",
        );
      const ips = Object.entries(target.ips ?? {}).filter(([, ip]) => !ip.includes(":"));
      const shared = ips.find(([network]) => serverNetworks.includes(network));
      const ip = (shared ?? ips[0])?.[1];
      if (!ip)
        throw new ValidationError(
          `container "${entry.container}" (used by ${entry.name}) has no IP: is it running?`,
          "errors.dnsTargetNoIp",
        );
      return { name: entry.name, ip };
    });
  }

  private async finish(
    id: string,
    apply: DnsApply,
    since: number,
    outputs: string[],
  ): Promise<DnsApplyResult> {
    if (apply.type === "restart") {
      await this.engine.containerAction(id, "restart");
      return { ok: true, output: outputs.join("\n") };
    }
    // The server reloads on its own: report what it says about the new configuration.
    const deadline = Date.now() + apply.waitMs;
    while (Date.now() < deadline) {
      const logs = await this.engine.containerLogs(
        id,
        50,
        Math.max(1, Math.floor(Date.now() / 1000) - since + 1),
      );
      if (apply.failed.test(logs)) return { ok: false, output: logs.trim().slice(-2000) };
      if (apply.ok.test(logs)) return { ok: true, output: outputs.join("\n") };
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    return {
      ok: false,
      output: [...outputs, "the server did not confirm the reload in time"].join("\n"),
    };
  }
}
