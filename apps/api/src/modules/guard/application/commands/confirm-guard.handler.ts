import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { confirmPending, settle } from "../../domain/guard-state.js";
import { GuardStore } from "../ports/guard-store.js";
import { ConfirmGuardCommand } from "./confirm-guard.command.js";

@CommandHandler(ConfirmGuardCommand)
export class ConfirmGuardHandler implements ICommandHandler<ConfirmGuardCommand, void> {
  constructor(@Inject(GuardStore) private readonly store: GuardStore) {}

  async execute(): Promise<void> {
    const state = settle(await this.store.load(), Date.now());
    if (!state.pending)
      throw new ConflictError("there is no change waiting for confirmation", "errors.guardNoTrial");
    await this.store.save(confirmPending(state));
  }
}
