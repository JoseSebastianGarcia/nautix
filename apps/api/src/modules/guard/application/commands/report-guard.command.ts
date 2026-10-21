import type { GuardReport } from "@nautix/contracts";

export class ReportGuardCommand {
  constructor(readonly report: GuardReport) {}
}
