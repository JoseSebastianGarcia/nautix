import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { disableAll } from "../../domain/guard-state.js";
import { GuardStore } from "../ports/guard-store.js";
import { DisableGuardCommand } from "./disable-guard.command.js";

/** Removes every rule: the helper takes the Nautix chain out of the firewall on its next poll. */
@CommandHandler(DisableGuardCommand)
export class DisableGuardHandler implements ICommandHandler<DisableGuardCommand, void> {
  constructor(@Inject(GuardStore) private readonly store: GuardStore) {}

  async execute(): Promise<void> {
    await this.store.save(disableAll(await this.store.load()));
  }
}
