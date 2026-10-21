import { hostname } from "node:os";
import { type DynamicModule, Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { APP_CONFIG, type AppConfig } from "../../shared/config.js";
import { openDatabase } from "../../shared/sqlite-database.js";
import { ApplyDnsHandler } from "./application/commands/apply-dns.handler.js";
import { ApplyGatewayHandler } from "./application/commands/apply-gateway.handler.js";
import { BuildContextHandler } from "./application/commands/build-context.handler.js";
import { BuildImageHandler } from "./application/commands/build-image.handler.js";
import { ChangeExposureHandler } from "./application/commands/change-exposure.handler.js";
import { CommitContainerHandler } from "./application/commands/commit-container.handler.js";
import { ConnectNetworkHandler } from "./application/commands/connect-network.handler.js";
import { ContainerActionHandler } from "./application/commands/container-action.handler.js";
import { CreateContainerHandler } from "./application/commands/create-container.handler.js";
import { CreateNetworkHandler } from "./application/commands/create-network.handler.js";
import { CreateTunnelHandler } from "./application/commands/create-tunnel.handler.js";
import { CreateVolumeHandler } from "./application/commands/create-volume.handler.js";
import { DisconnectNetworkHandler } from "./application/commands/disconnect-network.handler.js";
import { ImportImageHandler } from "./application/commands/import-image.handler.js";
import { LoadImageHandler } from "./application/commands/load-image.handler.js";
import { PruneResourcesHandler } from "./application/commands/prune-resources.handler.js";
import { PullImageHandler } from "./application/commands/pull-image.handler.js";
import { PushImageHandler } from "./application/commands/push-image.handler.js";
import { PutArchiveHandler } from "./application/commands/put-archive.handler.js";
import { RecreateContainerHandler } from "./application/commands/recreate-container.handler.js";
import { RemoveContainerHandler } from "./application/commands/remove-container.handler.js";
import { RemoveImageHandler } from "./application/commands/remove-image.handler.js";
import { RemoveNetworkHandler } from "./application/commands/remove-network.handler.js";
import { RemoveRegistryHandler } from "./application/commands/remove-registry.handler.js";
import { RemoveVolumeHandler } from "./application/commands/remove-volume.handler.js";
import { RenameContainerHandler } from "./application/commands/rename-container.handler.js";
import { SaveRegistryHandler } from "./application/commands/save-registry.handler.js";
import { SetContainerEnvHandler } from "./application/commands/set-container-env.handler.js";
import { SetFixedIpHandler } from "./application/commands/set-fixed-ip.handler.js";
import { TagImageHandler } from "./application/commands/tag-image.handler.js";
import { TestRegistryAuthHandler } from "./application/commands/test-registry-auth.handler.js";
import { UpdateContainerHandler } from "./application/commands/update-container.handler.js";
import { WaitContainerHandler } from "./application/commands/wait-container.handler.js";
import { DockerEngine } from "./application/ports/docker-engine.js";
import { RegistryStore } from "./application/ports/registry-store.js";
import { SelfIdentity } from "./application/ports/self-identity.js";
import { BrowseVolumeHandler } from "./application/queries/browse-volume.handler.js";
import { ExportComposeHandler } from "./application/queries/export-compose.handler.js";
import { ExportContainerHandler } from "./application/queries/export-container.handler.js";
import { GetArchiveHandler } from "./application/queries/get-archive.handler.js";
import { GetContainerDiffHandler } from "./application/queries/get-container-diff.handler.js";
import { GetContainerLogsHandler } from "./application/queries/get-container-logs.handler.js";
import { GetContainerStatsHandler } from "./application/queries/get-container-stats.handler.js";
import { GetContainerTopHandler } from "./application/queries/get-container-top.handler.js";
import { GetDiskUsageHandler } from "./application/queries/get-disk-usage.handler.js";
import { GetEngineInfoHandler } from "./application/queries/get-engine-info.handler.js";
import { GetImageHistoryHandler } from "./application/queries/get-image-history.handler.js";
import { GetRawInfoHandler } from "./application/queries/get-raw-info.handler.js";
import { GetVersionHandler } from "./application/queries/get-version.handler.js";
import { InspectHandler } from "./application/queries/inspect.handler.js";
import { ListContainersHandler } from "./application/queries/list-containers.handler.js";
import { ListImagesHandler } from "./application/queries/list-images.handler.js";
import { ListNetworksHandler } from "./application/queries/list-networks.handler.js";
import { ListRegistriesHandler } from "./application/queries/list-registries.handler.js";
import { ListVolumesHandler } from "./application/queries/list-volumes.handler.js";
import { LookupDnsHandler } from "./application/queries/lookup-dns.handler.js";
import { PreviewPruneHandler } from "./application/queries/preview-prune.handler.js";
import { SaveImageHandler } from "./application/queries/save-image.handler.js";
import { SearchImagesHandler } from "./application/queries/search-images.handler.js";
import { WatchDetailedEventsHandler } from "./application/queries/watch-detailed-events.handler.js";
import { WatchEventsHandler } from "./application/queries/watch-events.handler.js";
import { SelfGuard } from "./application/self-guard.js";
import { AesGcmCipher } from "./infrastructure/aes-gcm-cipher.js";
import { DockerSocketEngine } from "./infrastructure/docker-socket-engine.js";
import { FakeDockerEngine } from "./infrastructure/fake-docker-engine.js";
import { HostnameSelfIdentity } from "./infrastructure/hostname-self-identity.js";
import { SqliteRegistryStore } from "./infrastructure/sqlite-registry-store.js";
import { BuildController } from "./presentation/build.controller.js";
import { ContainerDetailsController } from "./presentation/container-details.controller.js";
import { DockerController } from "./presentation/docker.controller.js";
import { ImageToolsController } from "./presentation/image-tools.controller.js";
import { SystemController } from "./presentation/system.controller.js";

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
  CreateTunnelHandler,
  ApplyGatewayHandler,
  GetImageHistoryHandler,
  SaveImageHandler,
  SearchImagesHandler,
  GetRawInfoHandler,
  GetVersionHandler,
  GetDiskUsageHandler,
  WatchDetailedEventsHandler,
  TagImageHandler,
  LoadImageHandler,
  ImportImageHandler,
  PushImageHandler,
  BuildImageHandler,
  BuildContextHandler,
  SetFixedIpHandler,
  ChangeExposureHandler,
  SetContainerEnvHandler,
  RecreateContainerHandler,
  ApplyDnsHandler,
  LookupDnsHandler,
  BrowseVolumeHandler,
  SaveRegistryHandler,
  RemoveRegistryHandler,
  ListRegistriesHandler,
  TestRegistryAuthHandler,
  PruneResourcesHandler,
  PreviewPruneHandler,
  InspectHandler,
  GetContainerStatsHandler,
  GetContainerTopHandler,
  GetContainerDiffHandler,
  ExportContainerHandler,
  GetArchiveHandler,
  RenameContainerHandler,
  UpdateContainerHandler,
  CommitContainerHandler,
  PutArchiveHandler,
  WaitContainerHandler,
];

@Module({})
export class DockerModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: DockerModule,
      imports: [CqrsModule],
      controllers: [
        ContainerDetailsController,
        BuildController,
        ImageToolsController,
        SystemController,
        DockerController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        {
          provide: RegistryStore,
          useFactory: () =>
            new SqliteRegistryStore(openDatabase(config.dataDir), new AesGcmCipher(config.dataDir)),
        },
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
