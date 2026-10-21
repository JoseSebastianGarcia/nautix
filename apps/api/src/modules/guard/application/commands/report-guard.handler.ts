import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { GuardStore } from "../ports/guard-store.js";
import { ReportGuardCommand } from "./report-guard.command.js";

/** The helper says what it applied; this is also its heartbeat. */
@CommandHandler(ReportGuardCommand)
export class ReportGuardHandler implements ICommandHandler<ReportGuardCommand, void> {
  constructor(@Inject(GuardStore) private readonly store: GuardStore) {}

  async execute({ report }: ReportGuardCommand): Promise<void> {
    const state = await this.store.load();
    await this.store.save({ ...state, report: { ...report, at: Date.now() } });
  }
}
