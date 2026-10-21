import type { ChangeExposure } from "@nautix/contracts";

export class ChangeExposureCommand {
  constructor(
    readonly containerId: string,
    readonly ports: ChangeExposure["ports"],
  ) {}
}
