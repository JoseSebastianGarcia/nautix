import type { BuildRequest } from "@nautix/contracts";

export class BuildImageCommand {
  constructor(readonly request: BuildRequest) {}
}
