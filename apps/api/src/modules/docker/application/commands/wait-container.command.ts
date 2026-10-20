export class WaitContainerCommand {
  constructor(
    public readonly id: string,
    public readonly timeoutMs: number,
  ) {}
}
