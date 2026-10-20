import type { Readable } from "node:stream";

export class ImportImageCommand {
  constructor(
    public readonly tar: Readable,
    public readonly repository: string,
    public readonly tag: string,
  ) {}
}
