import type { InspectKind } from "../ports/docker-engine.js";

export class InspectQuery {
  constructor(
    public readonly kind: InspectKind,
    public readonly id: string,
  ) {}
}
