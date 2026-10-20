import type { PruneKind } from "@nautix/contracts";

export class PruneResourcesCommand {
  constructor(
    public readonly kind: PruneKind,
    public readonly all: boolean,
  ) {}
}
