import type { GuardBackend } from "@nautix/contracts";

export class PreviewGuardQuery {
  constructor(readonly backend: GuardBackend) {}
}
