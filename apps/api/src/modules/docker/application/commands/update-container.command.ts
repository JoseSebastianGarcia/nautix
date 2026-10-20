import type { UpdateContainer as UpdateContainerInput } from "@nautix/contracts";

export class UpdateContainerCommand {
  constructor(
    public readonly id: string,
    public readonly update: UpdateContainerInput,
  ) {}
}
