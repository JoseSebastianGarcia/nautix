import type { CreateBinding } from "@nautix/contracts";

export class CreateBindingCommand {
  constructor(readonly input: CreateBinding) {}
}
