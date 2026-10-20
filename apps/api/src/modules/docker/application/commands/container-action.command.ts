import type { ContainerAction } from "@nautix/contracts";
import type { ActionOptions } from "../ports/docker-engine.js";

export class ContainerActionCommand {
  constructor(
    public readonly id: string,
    public readonly action: ContainerAction,
    public readonly options: ActionOptions = {},
  ) {}
}
