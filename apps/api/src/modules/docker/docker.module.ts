import { hostname } from "node:os";
import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { APP_CONFIG, type AppConfig } from "../../shared/config.js";
import { ConnectNetworkHandler } from "./application/commands/connect-network.handler.js";
import { ContainerActionHandler } from "./application/commands/container-action.handler.js";
import { CreateContainerHandler } from "./application/commands/create-container.handler.js";
import { CreateNetworkHandler } from "./application/commands/create-network.handler.js";
import { CreateVolumeHandler } from "./application/commands/create-volume.handler.js";
import { DisconnectNetworkHandler } from "./application/commands/disconnect-network.handler.js";
import { PullImageHandler } from "./application/commands/pull-image.handler.js";
import { RemoveContainerHandler } from "./application/commands/remove-container.handler.js";
import { RemoveImageHandler } from "./application/commands/remove-image.handler.js";
import { RemoveNetworkHandler } from "./application/commands/remove-network.handler.js";
import { RemoveVolumeHandler } from "./application/commands/remove-volume.handler.js";
import { DockerEngine } from "./application/ports/docker-engine.js";
import { SelfIdentity } from "./application/ports/self-identity.js";
import { ExportComposeHandler } from "./application/queries/export-compose.handler.js";
import { GetContainerLogsHandler } from "./application/queries/get-container-logs.handler.js";
import { GetEngineInfoHandler } from "./application/queries/get-engine-info.handler.js";
import { ListContainersHandler } from "./application/queries/list-containers.handler.js";
import { ListImagesHandler } from "./application/queries/list-images.handler.js";
import { ListNetworksHandler } from "./application/queries/list-networks.handler.js";
import { ListVolumesHandler } from "./application/queries/list-volumes.handler.js";
import { WatchEventsHandler } from "./application/queries/watch-events.handler.js";
import { SelfGuard } from "./application/self-guard.js";
import { DockerSocketEngine } from "./infrastructure/docker-socket-engine.js";
import { FakeDockerEngine } from "./infrastructure/fake-docker-engine.js";
import { HostnameSelfIdentity } from "./infrastructure/hostname-self-identity.js";
import { DockerController } from "./presentation/docker.controller.js";

const HANDLERS = [
  ConnectNetworkHandler,
  ContainerActionHandler,
  CreateContainerHandler,
  CreateNetworkHandler,
  CreateVolumeHandler,
  DisconnectNetworkHandler,
  PullImageHandler,
  RemoveContainerHandler,
  RemoveImageHandler,
  RemoveNetworkHandler,
  RemoveVolumeHandler,
  GetContainerLogsHandler,
  GetEngineInfoHandler,
  ListContainersHandler,
  ListImagesHandler,
  ListNetworksHandler,
  ListVolumesHandler,
  WatchEventsHandler,
  ExportComposeHandler,
];

@Module({})
export class DockerModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: DockerModule,
      imports: [CqrsModule],
      controllers: [DockerController],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        {
          provide: DockerEngine,
          useFactory: () =>
            config.engine === "fake"
              ? new FakeDockerEngine()
              : new DockerSocketEngine(config.dockerSocket),
        },
        {
          provide: SelfIdentity,
          useFactory: () =>
            new HostnameSelfIdentity(
              hostname(),
              config.engine === "fake"
                ? (process.env.NAUTIX_SELF_NAME ?? "nautix")
                : process.env.NAUTIX_SELF_NAME,
            ),
        },
        SelfGuard,
        ...HANDLERS,
      ],
    };
  }
}
