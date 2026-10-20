export interface TerminalChannel {
  onData(listener: (chunk: Buffer) => void): void;
  onClose(listener: () => void): void;
  write(data: Buffer | string): void;
  resize(cols: number, rows: number): void;
  close(): void;
}

/** Port: an interactive shell inside a container (`docker exec -it`), never on the host. */
export abstract class TerminalEngine {
  abstract open(containerId: string, cols: number, rows: number): Promise<TerminalChannel>;
}
