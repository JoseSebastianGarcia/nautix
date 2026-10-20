import { type TerminalChannel, TerminalEngine } from "../application/ports/terminal-engine.js";

/** Demo shell: echoes typed lines like a tiny REPL. Used with NAUTIX_ENGINE=fake and in tests. */
export class FakeTerminalEngine extends TerminalEngine {
  async open(containerId: string): Promise<TerminalChannel> {
    const data: ((c: Buffer) => void)[] = [];
    const close: (() => void)[] = [];
    const early: Buffer[] = [];
    const out = (text: string) => {
      const chunk = Buffer.from(text);
      if (data.length === 0) early.push(chunk);
      for (const l of data) l(chunk);
    };
    let line = "";
    queueMicrotask(() => out(`demo shell in ${containerId.slice(0, 12)}\r\n$ `));
    return {
      onData: (l) => {
        data.push(l);
        for (const chunk of early.splice(0)) l(chunk);
      },
      onClose: (l) => void close.push(l),
      write: (d) => {
        for (const ch of d.toString()) {
          if (ch === "\r") {
            out(`\r\n${line === "exit" ? "bye" : `you typed: ${line}`}\r\n$ `);
            if (line === "exit") for (const l of close) l();
            line = "";
          } else {
            line += ch;
            out(ch);
          }
        }
      },
      resize: () => undefined,
      close: () => {
        for (const l of close) l();
      },
    };
  }
}
