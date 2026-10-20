export class SaveComposeProjectCommand {
  constructor(
    public readonly name: string,
    public readonly content: string,
  ) {}
}
