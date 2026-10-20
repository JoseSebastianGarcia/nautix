export class ConnectNetworkCommand {
  constructor(
    public readonly networkId: string,
    public readonly containerId: string,
  ) {}
}
