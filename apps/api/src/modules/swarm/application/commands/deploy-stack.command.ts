export class DeployStackCommand {
  constructor(
    readonly name: string,
    readonly yaml: string,
  ) {}
}
