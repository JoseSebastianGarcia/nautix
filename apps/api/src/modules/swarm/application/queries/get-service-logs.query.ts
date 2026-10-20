export class GetServiceLogsQuery {
  constructor(
    readonly id: string,
    readonly tail: number,
  ) {}
}
