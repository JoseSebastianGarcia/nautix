import {
  Autolock,
  CreateSwarmBinding,
  CreateSwarmSecret,
  CreateSwarmService,
  DeployStack,
  InitSwarm,
  JoinSwarm,
  LeaveSwarm,
  RotateToken,
  UnlockSwarm,
  UpdateSwarmNode,
  UpdateSwarmService,
} from "@nautix/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { z } from "zod";
import { bindingDetail, setAuditNote } from "../../../shared/audit-note.js";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { CreateSwarmBindingCommand } from "../application/commands/create-swarm-binding.command.js";
import { CreateSwarmConfigValueCommand } from "../application/commands/create-swarm-config-value.command.js";
import { CreateSwarmSecretValueCommand } from "../application/commands/create-swarm-secret-value.command.js";
import { CreateSwarmServiceSpecCommand } from "../application/commands/create-swarm-service-spec.command.js";
import { DeleteSwarmBindingCommand } from "../application/commands/delete-swarm-binding.command.js";
import { DeployStackCommand } from "../application/commands/deploy-stack.command.js";
import { InitSwarmCommand } from "../application/commands/init-swarm.command.js";
import { JoinSwarmCommand } from "../application/commands/join-swarm.command.js";
import { LeaveSwarmCommand } from "../application/commands/leave-swarm.command.js";
import { RemoveStackCommand } from "../application/commands/remove-stack.command.js";
import { RemoveSwarmConfigCommand } from "../application/commands/remove-swarm-config.command.js";
import { RemoveSwarmNodeCommand } from "../application/commands/remove-swarm-node.command.js";
import { RemoveSwarmSecretCommand } from "../application/commands/remove-swarm-secret.command.js";
import { RemoveSwarmServiceCommand } from "../application/commands/remove-swarm-service.command.js";
import { RollbackSwarmServiceCommand } from "../application/commands/rollback-swarm-service.command.js";
import { RotateJoinTokenCommand } from "../application/commands/rotate-join-token.command.js";
import { SetSwarmAutolockCommand } from "../application/commands/set-swarm-autolock.command.js";
import { UnlockSwarmCommand } from "../application/commands/unlock-swarm.command.js";
import { UpdateSwarmNodeSpecCommand } from "../application/commands/update-swarm-node-spec.command.js";
import { UpdateSwarmServiceSpecCommand } from "../application/commands/update-swarm-service-spec.command.js";
import { GetJoinTokensQuery } from "../application/queries/get-join-tokens.query.js";
import { GetServiceLogsQuery } from "../application/queries/get-service-logs.query.js";
import { GetSwarmQuery } from "../application/queries/get-swarm.query.js";
import { GetSwarmClusterQuery } from "../application/queries/get-swarm-cluster.query.js";
import { GetSwarmConfigDataQuery } from "../application/queries/get-swarm-config-data.query.js";
import { GetSwarmUnlockKeyQuery } from "../application/queries/get-swarm-unlock-key.query.js";
import { ListServiceTasksQuery } from "../application/queries/list-service-tasks.query.js";
import { ListStacksQuery } from "../application/queries/list-stacks.query.js";
import { ListSwarmBindingsQuery } from "../application/queries/list-swarm-bindings.query.js";
import { ListSwarmConfigsQuery } from "../application/queries/list-swarm-configs.query.js";
import { ListSwarmNodesQuery } from "../application/queries/list-swarm-nodes.query.js";
import { ListSwarmSecretsQuery } from "../application/queries/list-swarm-secrets.query.js";
import { ListSwarmServicesQuery } from "../application/queries/list-swarm-services.query.js";
import { PlanSwarmBindingQuery } from "../application/queries/plan-swarm-binding.query.js";

const Force = z.object({ force: z.enum(["true", "false"]).default("false") });
const Tail = z.object({ tail: z.coerce.number().int().min(1).max(5000).default(200) });
const Named = z.object({ name: z.string().min(1).max(128), value: z.string().min(1).max(500_000) });

/** docker swarm / node / service / secret / config / stack. Reads are open to viewers, except keys and values. */
@Controller("api/v1/swarm")
export class SwarmController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  status() {
    return this.queries.execute(new GetSwarmQuery());
  }

  @Post("init")
  init(@Body() body: unknown) {
    return this.commands
      .execute(new InitSwarmCommand(parse(InitSwarm, body).advertiseAddr))
      .then((nodeId) => ({ nodeId }));
  }

  @Post("join")
  @HttpCode(204)
  async join(@Body() body: unknown) {
    const b = parse(JoinSwarm, body);
    await this.commands.execute(new JoinSwarmCommand(b.remoteAddr, b.token, b.advertiseAddr));
  }

  @Post("leave")
  @HttpCode(204)
  async leave(@Body() body: unknown) {
    await this.commands.execute(new LeaveSwarmCommand(parse(LeaveSwarm, body).force));
  }

  @AdminOnly()
  @Get("tokens")
  tokens() {
    return this.queries.execute(new GetJoinTokensQuery());
  }

  @Post("tokens/rotate")
  @HttpCode(204)
  async rotate(@Body() body: unknown) {
    await this.commands.execute(new RotateJoinTokenCommand(parse(RotateToken, body).target));
  }

  @Put("autolock")
  @HttpCode(204)
  async autolock(@Body() body: unknown) {
    await this.commands.execute(new SetSwarmAutolockCommand(parse(Autolock, body).enabled));
  }

  @AdminOnly()
  @Get("unlock-key")
  unlockKey() {
    return this.queries.execute(new GetSwarmUnlockKeyQuery()).then((key) => ({ key }));
  }

  @Post("unlock")
  @HttpCode(204)
  async unlock(@Body() body: unknown) {
    await this.commands.execute(new UnlockSwarmCommand(parse(UnlockSwarm, body).key));
  }

  /** Status, nodes, services and tasks in one read (empty lists unless this engine is an unlocked manager). */
  @Get("cluster")
  cluster() {
    return this.queries.execute(new GetSwarmClusterQuery());
  }

  @Get("nodes")
  nodes() {
    return this.queries.execute(new ListSwarmNodesQuery());
  }

  @Patch("nodes/:id")
  @HttpCode(204)
  async updateNode(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(new UpdateSwarmNodeSpecCommand(id, parse(UpdateSwarmNode, body)));
  }

  @Delete("nodes/:id")
  @HttpCode(204)
  async removeNode(@Param("id") id: string, @Query() query: unknown) {
    await this.commands.execute(
      new RemoveSwarmNodeCommand(id, parse(Force, query).force === "true"),
    );
  }

  @Get("services")
  services() {
    return this.queries.execute(new ListSwarmServicesQuery());
  }

  @Post("services")
  createService(@Body() body: unknown) {
    return this.commands.execute(
      new CreateSwarmServiceSpecCommand(parse(CreateSwarmService, body)),
    );
  }

  @Patch("services/:id")
  @HttpCode(204)
  async updateService(@Param("id") id: string, @Body() body: unknown) {
    await this.commands.execute(
      new UpdateSwarmServiceSpecCommand(id, parse(UpdateSwarmService, body)),
    );
  }

  /** Back to the spec the service had before its last update. */
  @Post("services/:id/rollback")
  @HttpCode(204)
  async rollbackService(@Param("id") id: string) {
    await this.commands.execute(new RollbackSwarmServiceCommand(id));
  }

  @Delete("services/:id")
  @HttpCode(204)
  async removeService(@Param("id") id: string) {
    await this.commands.execute(new RemoveSwarmServiceCommand(id));
  }

  /** Bindings between services: what a service uses of another, wired into its environment. */
  @Get("bindings")
  bindings() {
    return this.queries.execute(new ListSwarmBindingsQuery());
  }

  @Get("bindings/plan")
  planBinding(@Query() query: unknown, @Req() req: Request) {
    setAuditNote(req, { detail: "", skip: true });
    return this.queries.execute(new PlanSwarmBindingQuery(parse(CreateSwarmBinding, query)));
  }

  @AdminOnly()
  @Post("bindings")
  async createBinding(@Body() body: unknown, @Req() req: Request) {
    const binding = await this.commands.execute(
      new CreateSwarmBindingCommand(parse(CreateSwarmBinding, body)),
    );
    setAuditNote(req, { detail: `service ${bindingDetail("create", binding)}` });
    return binding;
  }

  @AdminOnly()
  @Delete("bindings/:id")
  @HttpCode(204)
  async deleteBinding(@Param("id") id: string, @Req() req: Request) {
    const binding = await this.commands.execute(new DeleteSwarmBindingCommand(id));
    setAuditNote(req, { detail: `service ${bindingDetail("delete", binding)}` });
  }

  @Get("services/:id/tasks")
  tasks(@Param("id") id: string) {
    return this.queries.execute(new ListServiceTasksQuery(id));
  }

  @Get("services/:id/logs")
  async logs(@Param("id") id: string, @Query() query: unknown) {
    return {
      logs: await this.queries.execute(new GetServiceLogsQuery(id, parse(Tail, query).tail)),
    };
  }

  @Get("secrets")
  secrets() {
    return this.queries.execute(new ListSwarmSecretsQuery());
  }

  /** The value is sent once and can never be read back. */
  @Post("secrets")
  @HttpCode(204)
  async createSecret(@Body() body: unknown) {
    const b = parse(CreateSwarmSecret, body);
    await this.commands.execute(new CreateSwarmSecretValueCommand(b.name, b.value));
  }

  @Delete("secrets/:id")
  @HttpCode(204)
  async removeSecret(@Param("id") id: string) {
    await this.commands.execute(new RemoveSwarmSecretCommand(id));
  }

  @Get("configs")
  configs() {
    return this.queries.execute(new ListSwarmConfigsQuery());
  }

  @AdminOnly()
  @Get("configs/:id/data")
  configData(@Param("id") id: string) {
    return this.queries.execute(new GetSwarmConfigDataQuery(id)).then((data) => ({ data }));
  }

  @Post("configs")
  @HttpCode(204)
  async createConfig(@Body() body: unknown) {
    const b = parse(Named, body);
    await this.commands.execute(new CreateSwarmConfigValueCommand(b.name, b.value));
  }

  @Delete("configs/:id")
  @HttpCode(204)
  async removeConfig(@Param("id") id: string) {
    await this.commands.execute(new RemoveSwarmConfigCommand(id));
  }

  @Get("stacks")
  stacks() {
    return this.queries.execute(new ListStacksQuery());
  }

  @Post("stacks")
  deploy(@Body() body: unknown) {
    const b = parse(DeployStack, body);
    return this.commands.execute(new DeployStackCommand(b.name, b.yaml));
  }

  @Delete("stacks/:name")
  remove(@Param("name") name: string) {
    return this.commands.execute(
      new RemoveStackCommand(parse(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/), name)),
    );
  }
}
