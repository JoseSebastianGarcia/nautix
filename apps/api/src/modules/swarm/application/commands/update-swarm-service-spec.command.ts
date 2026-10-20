import type { UpdateSwarmService } from "@nautix/contracts";

export class UpdateSwarmServiceSpecCommand {
  constructor(
    readonly id: string,
    readonly patch: UpdateSwarmService,
  ) {}
}
