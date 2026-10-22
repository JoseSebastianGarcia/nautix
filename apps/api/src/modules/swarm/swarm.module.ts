import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import type { AppConfig } from "../../shared/config.js";
import { CreateSwarmConfigValueHandler } from "./application/commands/create-swarm-config-value.handler.js";
import { CreateSwarmSecretValueHandler } from "./application/commands/create-swarm-secret-value.handler.js";
import { CreateSwarmServiceSpecHandler } from "./application/commands/create-swarm-service-spec.handler.js";
import { DeployStackHandler } from "./application/commands/deploy-stack.handler.js";
import { InitSwarmHandler } from "./application/commands/init-swarm.handler.js";
import { JoinSwarmHandler } from "./application/commands/join-swarm.handler.js";
import { LeaveSwarmHandler } from "./application/commands/leave-swarm.handler.js";
import { RemoveStackHandler } from "./application/commands/remove-stack.handler.js";
import { RemoveSwarmConfigHandler } from "./application/commands/remove-swarm-config.handler.js";
import { RemoveSwarmNodeHandler } from "./application/commands/remove-swarm-node.handler.js";
import { RemoveSwarmSecretHandler } from "./application/commands/remove-swarm-secret.handler.js";
import { RemoveSwarmServiceHandler } from "./application/commands/remove-swarm-service.handler.js";
import { RotateJoinTokenHandler } from "./application/commands/rotate-join-token.handler.js";
import { SetSwarmAutolockHandler } from "./application/commands/set-swarm-autolock.handler.js";
import { UnlockSwarmHandler } from "./application/commands/unlock-swarm.handler.js";
import { UpdateSwarmNodeSpecHandler } from "./application/commands/update-swarm-node-spec.handler.js";
import { UpdateSwarmServiceSpecHandler } from "./application/commands/update-swarm-service-spec.handler.js";
import { StackRunner } from "./application/ports/stack-runner.js";
import { SwarmEngine } from "./application/ports/swarm-engine.js";
import { GetJoinTokensHandler } from "./application/queries/get-join-tokens.handler.js";
import { GetServiceLogsHandler } from "./application/queries/get-service-logs.handler.js";
import { GetSwarmHandler } from "./application/queries/get-swarm.handler.js";
import { GetSwarmClusterHandler } from "./application/queries/get-swarm-cluster.handler.js";
import { GetSwarmConfigDataHandler } from "./application/queries/get-swarm-config-data.handler.js";
import { GetSwarmUnlockKeyHandler } from "./application/queries/get-swarm-unlock-key.handler.js";
import { ListServiceTasksHandler } from "./application/queries/list-service-tasks.handler.js";
import { ListStacksHandler } from "./application/queries/list-stacks.handler.js";
import { ListSwarmConfigsHandler } from "./application/queries/list-swarm-configs.handler.js";
import { ListSwarmNodesHandler } from "./application/queries/list-swarm-nodes.handler.js";
import { ListSwarmSecretsHandler } from "./application/queries/list-swarm-secrets.handler.js";
import { ListSwarmServicesHandler } from "./application/queries/list-swarm-services.handler.js";
import { DockerSocketSwarmEngine } from "./infrastructure/docker-socket-swarm-engine.js";
import { FakeStackRunner } from "./infrastructure/fake-stack-runner.js";
import { FakeSwarmEngine } from "./infrastructure/fake-swarm-engine.js";
import { ProcessStackRunner } from "./infrastructure/process-stack-runner.js";
import { SwarmController } from "./presentation/swarm.controller.js";

const HANDLERS = [
  GetSwarmHandler,
  GetSwarmClusterHandler,
  InitSwarmHandler,
  JoinSwarmHandler,
  LeaveSwarmHandler,
  GetJoinTokensHandler,
  RotateJoinTokenHandler,
  SetSwarmAutolockHandler,
  GetSwarmUnlockKeyHandler,
  UnlockSwarmHandler,
  ListSwarmNodesHandler,
  UpdateSwarmNodeSpecHandler,
  RemoveSwarmNodeHandler,
  ListSwarmServicesHandler,
  ListServiceTasksHandler,
  GetServiceLogsHandler,
  CreateSwarmServiceSpecHandler,
  UpdateSwarmServiceSpecHandler,
  RemoveSwarmServiceHandler,
  ListSwarmSecretsHandler,
  CreateSwarmSecretValueHandler,
  RemoveSwarmSecretHandler,
  ListSwarmConfigsHandler,
  GetSwarmConfigDataHandler,
  CreateSwarmConfigValueHandler,
  RemoveSwarmConfigHandler,
  DeployStackHandler,
  RemoveStackHandler,
  ListStacksHandler,
];

@Module({})
export class SwarmModule {
  static register(config: AppConfig): DynamicModule {
    const fake = config.engine === "fake";
    return {
      module: SwarmModule,
      imports: [CqrsModule],
      controllers: [SwarmController],
      providers: [
        {
          provide: SwarmEngine,
          useFactory: () =>
            fake ? new FakeSwarmEngine() : new DockerSocketSwarmEngine(config.dockerSocket),
        },
        {
          provide: StackRunner,
          useFactory: () =>
            fake
              ? new FakeStackRunner()
              : new ProcessStackRunner({
                  dockerBin: process.env.NAUTIX_DOCKER_BIN ?? "docker",
                  socketPath: config.dockerSocket,
                  timeoutMs: 10 * 60 * 1000,
                }),
        },
        ...HANDLERS,
      ],
    };
  }
}
