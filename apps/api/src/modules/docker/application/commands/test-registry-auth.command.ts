import type { RegistryAuth } from "@nautix/contracts";

export class TestRegistryAuthCommand {
  constructor(public readonly auth: RegistryAuth) {}
}
