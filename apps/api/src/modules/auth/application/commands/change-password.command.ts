export class ChangePasswordCommand {
  constructor(
    readonly username: string,
    readonly currentPassword: string,
    readonly newPassword: string,
    /** Raw cookie token of the session making the change; it stays signed in. */
    readonly sessionToken: string,
  ) {}
}
