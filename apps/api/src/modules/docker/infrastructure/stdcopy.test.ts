import { describe, expect, it } from "vitest";
import { demuxStdcopy, isMultiplexed } from "./stdcopy.js";

const frame = (type: number, text: string): Buffer => {
  const body = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
};

describe("stdcopy", () => {
  it("joins stdout and stderr frames", () => {
    const data = Buffer.concat([frame(1, "hello "), frame(2, "world")]);
    expect(isMultiplexed(data)).toBe(true);
    expect(demuxStdcopy(data)).toBe("hello world");
  });

  it("detects raw (tty) output", () => {
    expect(isMultiplexed(Buffer.from("plain text output here"))).toBe(false);
  });
});
