export class RemoveContainerCommand {
  constructor(
    public readonly id: string,
    public readonly force: boolean,
    public readonly confirm?: string,
  ) {}
}
