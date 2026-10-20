export class GetContainerLogsQuery {
  constructor(
    public readonly id: string,
    public readonly tail: number,
    public readonly sinceSeconds?: number,
  ) {}
}
