import type { BindingStyle } from "@nautix/contracts";

export class PlanBindingQuery {
  constructor(
    readonly consumer: string,
    readonly provider: string,
    readonly name: string | undefined,
    readonly style: BindingStyle,
  ) {}
}
