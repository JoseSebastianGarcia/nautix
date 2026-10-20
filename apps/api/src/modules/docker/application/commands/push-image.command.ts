import type { RegistryAuth } from "@nautix/contracts";

export class PushImageCommand {
  constructor(
    public readonly reference: string,
    public readonly auth: RegistryAuth | undefined,
  ) {}
}
