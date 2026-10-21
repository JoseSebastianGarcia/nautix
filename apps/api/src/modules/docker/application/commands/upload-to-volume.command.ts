import type { Readable } from "node:stream";

export class UploadToVolumeCommand {
  constructor(
    readonly volume: string,
    /** Directory of the volume the files are extracted into. */
    readonly path: string,
    readonly tar: Readable,
  ) {}
}
