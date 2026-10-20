export class DisconnectNetworkCommand {
  constructor(
    public readonly networkId: string,
    public readonly containerId: string,
  ) {}
}
