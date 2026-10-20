import type { SetupRequest } from "@nautix/contracts";

export class SetupCommand {
  constructor(public readonly request: SetupRequest) {}
}
