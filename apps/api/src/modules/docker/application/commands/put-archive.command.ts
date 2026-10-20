import type { Readable } from "node:stream";

export class PutArchiveCommand {
  constructor(
    public readonly id: string,
    public readonly path: string,
    public readonly tar: Readable,
  ) {}
}
