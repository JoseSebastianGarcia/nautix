export class RemoveSwarmNodeCommand {
  constructor(
    readonly id: string,
    readonly force: boolean,
  ) {}
}
