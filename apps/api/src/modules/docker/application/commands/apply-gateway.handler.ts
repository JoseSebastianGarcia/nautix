import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { GATEWAY_HELPER_IMAGE, type GatewayApplyResult, gatewayKind } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import type { EngineContainerSpec } from "../../domain/container-spec.js";
import { type GatewayPlan, planGateway } from "../../domain/gateway-plan.js";
import { buildTar } from "../../domain/tar.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { ApplyGatewayCommand } from "./apply-gateway.command.js";

const WAIT_MS = 60_000;
const COMMAND_MS = 30_000;
const MAX_OUTPUT = 4000;
// The YAML travels in an environment variable and is only ever expanded by the shell as a quoted
// value, so route data can never become shell syntax.
const KONG_SCRIPT =
  'printf \'%s\' "$KONG_CONFIG" > /tmp/kong.yml && curl -sS --max-time 20 -f -X POST "http://$KONG_HOST:8001/config" -F config=@/tmp/kong.yml';

/**
 * Publishes routes to a gateway, whatever its type. The plan (see gateway-plan.ts) says how:
 * Kong needs its admin API, reachable only from its network, so a short-lived helper container
 * posts the config; Nginx, Caddy and Traefik get a config file copied in (plus a validated
 * reload for the first two).
 */
@CommandHandler(ApplyGatewayCommand)
export class ApplyGatewayHandler
  implements ICommandHandler<ApplyGatewayCommand, GatewayApplyResult>
{
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  async execute({ container, routes }: ApplyGatewayCommand): Promise<GatewayApplyResult> {
    const [containers, networks] = await Promise.all([
      this.engine.listContainers(),
      this.engine.listNetworks(),
    ]);
    const gateway = containers.find((c) => c.id === container || c.name === container);
    if (!gateway) throw new NotFoundError("gateway not found", "errors.notFound");
    const kind = gatewayKind(gateway.image);
    if (!kind || gateway.labels["nautix.tunnel"] === "true") {
      throw new ValidationError("this container is not a supported gateway", "errors.notGateway");
    }
    if (gateway.state !== "running")
      throw new ConflictError("the gateway is not running", "errors.gatewayNotRunning");

    const plan = planGateway(kind, routes); // validates the routes for this gateway type first
    if (plan.mode === "files") return this.applyFiles(gateway.id, plan);

    const network = networks.find((n) => !n.system && gateway.networks.includes(n.name));
    if (!network)
      throw new ValidationError(
        "the gateway is on no user-defined network",
        "errors.gatewayNoNetwork",
      );
    return this.applyKong(gateway.name, network.name, plan.yaml);
  }

  private async applyFiles(
    id: string,
    plan: Extract<GatewayPlan, { mode: "files" }>,
  ): Promise<GatewayApplyResult> {
    await this.engine.putArchive(id, "/", Readable.from([buildTar(plan.files)]));
    const outputs: string[] = [];
    for (const command of plan.commands) {
      const result = await this.engine.runCommand(id, command, COMMAND_MS);
      if (result.output.trim()) outputs.push(result.output.trim());
      if (result.exitCode !== 0)
        return { ok: false, output: outputs.join("\n").slice(-MAX_OUTPUT) };
    }
    return { ok: true, output: outputs.join("\n").slice(-MAX_OUTPUT) };
  }

  private async applyKong(
    host: string,
    network: string,
    yaml: string,
  ): Promise<GatewayApplyResult> {
    const spec: EngineContainerSpec = {
      name: `nautix-apply-${randomBytes(4).toString("hex")}`,
      image: GATEWAY_HELPER_IMAGE,
      env: [`KONG_CONFIG=${yaml}`, `KONG_HOST=${host}`],
      labels: { "nautix.managed": "true", "nautix.helper": "gateway-apply" },
      cmd: ["sh", "-c", KONG_SCRIPT],
      exposedPorts: {},
      portBindings: {},
      binds: [],
      restartPolicy: "no",
      networkName: network,
    };
    await this.engine.pullImageIfMissing(GATEWAY_HELPER_IMAGE);
    const helper = await this.engine.createContainer(spec);
    try {
      await this.engine.containerAction(helper.id, "start");
      const waited = await this.engine.waitContainer(helper.id, WAIT_MS);
      const logs = (await this.engine.containerLogs(helper.id, 50)).trim().slice(-MAX_OUTPUT);
      if (!waited.exited) return { ok: false, output: logs || "timed out waiting for the gateway" };
      return { ok: waited.statusCode === 0, output: logs };
    } finally {
      await this.engine.removeContainer(helper.id, true).catch(() => undefined);
    }
  }
}
