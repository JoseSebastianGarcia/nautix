import type { ApplyGate } from "@nautix/contracts";

export class SetContainerEnvCommand {
  constructor(
    readonly containerId: string,
    readonly set: Record<string, string>,
    readonly unset: string[],
    readonly gate?: ApplyGate,
  ) {}
}
