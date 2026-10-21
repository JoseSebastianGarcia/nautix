import type { GuardRule } from "@nautix/contracts";

export class SaveGuardRulesCommand {
  constructor(
    readonly rules: GuardRule[],
    readonly acknowledgeLockout: boolean,
    /** Address the request came from, to warn when the rules would cut it off. */
    readonly callerAddress: string,
  ) {}
}
