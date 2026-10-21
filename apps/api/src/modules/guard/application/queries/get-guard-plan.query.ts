export class GetGuardPlanQuery {
  /** True when the helper is the caller: the poll doubles as its heartbeat. */
  constructor(readonly markSeen = false) {}
}
