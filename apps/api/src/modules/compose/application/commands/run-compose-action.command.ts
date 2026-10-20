import type { ComposeAction } from "@nautix/contracts";

export class RunComposeActionCommand {
  constructor(
    public readonly name: string,
    public readonly action: ComposeAction,
    public readonly acknowledgeRisks: boolean,
    public readonly removeVolumes: boolean,
  ) {}
}
