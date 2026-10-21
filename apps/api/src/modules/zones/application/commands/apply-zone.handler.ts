import type { ZoneApplyResult } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError, ValidationError } from "../../../../shared/domain-error.js";
import { planZone } from "../../domain/plan-zone.js";
import { parseZoneSpec, stringifyZoneSpec } from "../../domain/zone-yaml.js";
import { ZoneStore } from "../ports/zone-store.js";
import { ZoneApplier } from "../zone-applier.js";
import { ZoneReader } from "../zone-reader.js";
import { ApplyZoneCommand } from "./apply-zone.command.js";

/**
 * Applies the document to the zone. It re-plans against reality and refuses to run when the plan is
 * not the one the user reviewed (something changed in between). Each action is safe on its own;
 * the first failure stops the run, and only a run with no failure becomes the zone's desired spec.
 */
@CommandHandler(ApplyZoneCommand)
export class ApplyZoneHandler implements ICommandHandler<ApplyZoneCommand, ZoneApplyResult> {
  constructor(
    @Inject(ZoneReader) private readonly reader: ZoneReader,
    @Inject(ZoneApplier) private readonly applier: ZoneApplier,
    @Inject(ZoneStore) private readonly store: ZoneStore,
  ) {}

  async execute({ zone, spec: text, planHash, allowRemovals }: ApplyZoneCommand) {
    const parsed = parseZoneSpec(text);
    if (!parsed.ok)
      throw new ValidationError(
        parsed.errors.map((e) => `${e.path || "document"}: ${e.message}`).join("; "),
        "errors.zoneInvalid",
      );
    if (parsed.spec.zone.name !== zone)
      throw new ValidationError("the document is for another zone", "errors.zoneNameMismatch");
    const facts = await this.reader.facts(zone);
    const plan = planZone(parsed.spec, facts);
    if (plan.errors.length > 0)
      throw new ValidationError(
        plan.errors.map((e) => e.key).join(", "),
        "errors.zonePlanHasErrors",
      );
    if (plan.hash !== planHash)
      throw new ConflictError("the zone changed since the plan was shown", "errors.zoneChanged");

    const results = await this.applier.run(parsed.spec, plan.actions, facts, allowRemovals);
    const ok = results.every((r) => r.status !== "failed");
    if (ok) await this.store.save(zone, stringifyZoneSpec(parsed.spec));
    return { ok, results } satisfies ZoneApplyResult;
  }
}
