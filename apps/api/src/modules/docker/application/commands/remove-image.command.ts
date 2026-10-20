export class RemoveImageCommand {
  constructor(
    public readonly id: string,
    public readonly force: boolean,
  ) {}
}
