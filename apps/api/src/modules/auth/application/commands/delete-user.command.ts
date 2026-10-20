export class DeleteUserCommand {
  constructor(
    public readonly id: string,
    /** Username of whoever asks; nobody can delete themselves. */
    public readonly actor: string,
  ) {}
}
