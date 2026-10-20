import type { Readable } from "node:stream";

export class LoadImageCommand {
  constructor(public readonly tar: Readable) {}
}
