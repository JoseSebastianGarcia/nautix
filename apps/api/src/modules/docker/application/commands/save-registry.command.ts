import type { SaveRegistry } from "@nautix/contracts";

export class SaveRegistryCommand {
  constructor(readonly registry: SaveRegistry) {}
}
