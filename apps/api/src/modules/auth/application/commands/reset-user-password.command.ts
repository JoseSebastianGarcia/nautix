export class ResetUserPasswordCommand {
  constructor(
    readonly id: string,
    readonly password: string,
  ) {}
}
