/**
 * Demultiplexes Docker's stream framing (8-byte header: type, 0,0,0, uint32 BE length).
 * Used for container logs when the container has no TTY.
 */
export const demuxStdcopy = (buffer: Buffer): string => {
  const parts: string[] = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    const end = offset + 8 + size;
    parts.push(buffer.subarray(offset + 8, Math.min(end, buffer.length)).toString("utf8"));
    offset = end;
  }
  return parts.join("");
};

/** Heuristic: a multiplexed stream starts with stream type 0..2 followed by three zero bytes. */
export const isMultiplexed = (buffer: Buffer): boolean =>
  buffer.length >= 8 && buffer[0] !== undefined && buffer[0] <= 2 && buffer.readUIntBE(1, 3) === 0;
