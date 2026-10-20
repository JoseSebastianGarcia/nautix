import type { CreateTunnel } from "@nautix/contracts";

export class CreateTunnelCommand {
  constructor(public readonly request: CreateTunnel) {}
}
