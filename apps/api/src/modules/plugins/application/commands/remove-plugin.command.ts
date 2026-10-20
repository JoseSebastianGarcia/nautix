export class RemovePluginCommand {
  constructor(
    readonly name: string,
    readonly force: boolean,
  ) {}
}
