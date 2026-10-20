export class SetPluginEnabledCommand {
  constructor(
    readonly name: string,
    readonly enabled: boolean,
  ) {}
}
