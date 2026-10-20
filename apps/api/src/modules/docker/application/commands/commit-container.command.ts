import type { CommitContainer as CommitContainerInput } from "@nautix/contracts";

export class CommitContainerCommand {
  constructor(
    public readonly id: string,
    public readonly input: CommitContainerInput,
  ) {}
}
