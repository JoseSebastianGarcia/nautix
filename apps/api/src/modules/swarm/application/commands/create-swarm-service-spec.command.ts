import type { CreateSwarmService } from "@nautix/contracts";

export class CreateSwarmServiceSpecCommand {
  constructor(readonly request: CreateSwarmService) {}
}
