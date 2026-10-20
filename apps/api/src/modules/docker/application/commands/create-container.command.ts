import type { CreateContainer } from "@nautix/contracts";

export class CreateContainerCommand {
  constructor(public readonly request: CreateContainer) {}
}
