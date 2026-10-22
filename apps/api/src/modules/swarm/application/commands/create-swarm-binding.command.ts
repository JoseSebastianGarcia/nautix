import type { CreateSwarmBinding } from "@nautix/contracts";

export class CreateSwarmBindingCommand {
  constructor(readonly input: CreateSwarmBinding) {}
}
