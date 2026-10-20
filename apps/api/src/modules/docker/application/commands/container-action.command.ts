import type { ContainerAction } from "@nautix/contracts";

export class ContainerActionCommand {
  constructor(
    public readonly id: string,
    public readonly action: ContainerAction,
    public readonly confirm?: string,
  ) {}
}
