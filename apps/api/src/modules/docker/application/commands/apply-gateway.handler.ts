import { randomBytes } from "node:crypto";
import { GATEWAY_HELPER_IMAGE, type GatewayApplyResult, isKongImage } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/domain-error.js";
import type { EngineContainerSpec } from "../../domain/container-spec.js";
import { buildKongConfig } from "../../domain/kong-config.js";
import { DockerEngine } from "../ports/docker-engine.js";
import { ApplyGatewayCommand } from "./apply-gateway.command.js";

const WAIT_MS = 60_000;
const MAX_OUTPUT = 4000;
// The YAML travels in an environment variable and is only ever expanded by the shell as a quoted
// value, so route data can never become shell syntax.
const SCRIPT =
  'printf \'%s\' "$KONG_CONFIG" > /tmp/kong.yml && curl -sS --max-time 20 -f -X POST "http://$KONG_HOST:8001/config" -F config=@/tmp/kong.yml';

/**
 * Pushes routes to a Kong running in DB-less mode. Nautix can't reach Kong's admin API from its
 * own container (it is locked and not on that network), so a short-lived helper container joins
 * Kong's network, posts the declarative config and is removed again.
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
    const kong = containers.find((c) => c.id === container || c.name === container);
    if (!kong) throw new NotFoundError("gateway not found", "errors.notFound");
    if (!isKongImage(kong.image))
      throw new ValidationError("this container is not a Kong gateway", "errors.notGateway");
    if (kong.state !== "running")
      throw new ConflictError("the gateway is not running", "errors.gatewayNotRunning");
    const network = networks.find((n) => !n.system && kong.networks.includes(n.name));
    if (!network)
      throw new ValidationError(
        "the gateway is on no user-defined network",
        "errors.gatewayNoNetwork",
      );

    const spec: EngineContainerSpec = {
      name: `nautix-apply-${randomBytes(4).toString("hex")}`,
      image: GATEWAY_HELPER_IMAGE,
      env: [`KONG_CONFIG=${buildKongConfig(routes)}`, `KONG_HOST=${kong.name}`],
      labels: { "nautix.managed": "true", "nautix.helper": "gateway-apply" },
      cmd: ["sh", "-c", SCRIPT],
      exposedPorts: {},
      portBindings: {},
      binds: [],
      restartPolicy: "no",
      networkName: network.name,
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
