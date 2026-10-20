export class TagImageCommand {
  constructor(
    public readonly ref: string,
    public readonly repository: string,
    public readonly tag: string,
  ) {}
}
