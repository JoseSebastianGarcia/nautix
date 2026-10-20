import type { DiskUsage } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { GetDiskUsageQuery } from "./get-disk-usage.query.js";

@QueryHandler(GetDiskUsageQuery)
export class GetDiskUsageHandler implements IQueryHandler<GetDiskUsageQuery, DiskUsage> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(): Promise<DiskUsage> {
    return this.engine.diskUsage();
  }
}
