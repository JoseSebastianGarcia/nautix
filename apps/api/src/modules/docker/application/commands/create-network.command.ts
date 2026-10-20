import type { CreateNetwork as CreateNetworkRequest } from "@nautix/contracts";

export class CreateNetworkCommand {
  constructor(public readonly request: CreateNetworkRequest) {}
}
