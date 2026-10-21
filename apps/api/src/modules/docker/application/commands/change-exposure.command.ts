import type { ApplyGate, ChangeExposure } from "@nautix/contracts";

export class ChangeExposureCommand {
  constructor(
    readonly containerId: string,
    readonly ports: ChangeExposure["ports"],
    readonly gate?: ApplyGate,
  ) {}
}
