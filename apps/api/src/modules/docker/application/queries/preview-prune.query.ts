import type { PruneKind } from "@nautix/contracts";

export class PreviewPruneQuery {
  constructor(
    public readonly kind: PruneKind,
    public readonly all: boolean,
  ) {}
}
