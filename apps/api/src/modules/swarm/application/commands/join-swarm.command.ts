export class JoinSwarmCommand {
  constructor(
    readonly remoteAddr: string,
    readonly token: string,
    readonly advertiseAddr: string | undefined,
  ) {}
}
