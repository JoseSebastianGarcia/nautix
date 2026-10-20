import type { UpdateSwarmNode } from "@nautix/contracts";

export class UpdateSwarmNodeSpecCommand {
  constructor(
    readonly id: string,
    readonly patch: UpdateSwarmNode,
  ) {}
}
