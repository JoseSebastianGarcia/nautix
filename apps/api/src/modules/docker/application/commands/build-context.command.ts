import type { Readable } from "node:stream";
import type { BuildContextOptions } from "@nautix/contracts";

/** Build from a tar of a project folder streamed by the client. */
export class BuildContextCommand {
  constructor(
    readonly context: Readable,
    readonly options: BuildContextOptions,
  ) {}
}
