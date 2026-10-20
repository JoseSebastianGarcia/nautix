export class SetFixedIpCommand {
  constructor(
    readonly containerId: string,
    /** Network name or id. */
    readonly network: string,
    /** null = automatic address again. */
    readonly ip: string | null,
  ) {}
}
