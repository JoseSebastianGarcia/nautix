import { PassThrough, type Readable } from "node:stream";
import { ValidationError } from "./domain-error.js";

/** Pipes `source` through, failing the stream with `errors.uploadTooLarge` past `max` bytes. */
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
