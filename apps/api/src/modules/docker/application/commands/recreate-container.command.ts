import type { ApplyGate } from "@nautix/contracts";
import type { ContainerChange } from "../../domain/recreate.js";

/** Recreates a container with a change, behind the health gate (other modules use this, e.g. bindings). */
export class RecreateContainerCommand {
  constructor(
    readonly containerId: string,
    readonly change: ContainerChange,
    readonly gate?: ApplyGate,
  ) {}
}
