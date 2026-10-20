export class CreateSwarmSecretValueCommand {
  constructor(
    readonly name: string,
    readonly value: string,
  ) {}
}
