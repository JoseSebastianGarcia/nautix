import type { Layout } from "@nautix/contracts";

export class SaveLayoutCommand {
  constructor(public readonly layout: Layout) {}
}
