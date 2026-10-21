import { PassThrough, type Readable } from "node:stream";
import { z } from "zod";
import { ValidationError } from "../../../shared/domain-error.js";

export const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

/** Absolute path in a container or volume, as the archive routes take it. */
export const ArchivePath = z.object({
  path: z
    .string()
    .min(1)
    .max(4096)
    .startsWith("/")
    .refine((p) => !p.includes("\0")),
});

/** Caps an upload so a client can't stream unbounded data into a container or volume. */
export const limitBytes = (source: Readable, max: number): Readable => {
  let seen = 0;
  const out = new PassThrough();
  source.on("data", (chunk: Buffer) => {
    seen += chunk.length;
    if (seen > max) {
      source.unpipe(out);
      out.destroy(new ValidationError("upload too large", "errors.uploadTooLarge"));
    }
  });
  source.on("error", (e) => out.destroy(e));
  return source.pipe(out);
};
