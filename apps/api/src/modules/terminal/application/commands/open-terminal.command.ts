export class OpenTerminalCommand {
  constructor(
    public readonly containerId: string,
    public readonly cols: number,
    public readonly rows: number,
  ) {}
}
