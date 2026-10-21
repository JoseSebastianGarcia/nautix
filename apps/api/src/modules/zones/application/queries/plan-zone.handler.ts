import type { ZonePlan } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { planZone } from "../../domain/plan-zone.js";
import { parseZoneSpec } from "../../domain/zone-yaml.js";
import { ZoneReader } from "../zone-reader.js";
import { PlanZoneQuery } from "./plan-zone.query.js";

export interface ZonePlanResult {
  /** Null when the document is not valid. */
  plan: ZonePlan | null;
  problems: { path: string; message: string }[];
}

/** What applying the document would do, without doing it. */
@QueryHandler(PlanZoneQuery)
export class PlanZoneHandler implements IQueryHandler<PlanZoneQuery, ZonePlanResult> {
  constructor(@Inject(ZoneReader) private readonly reader: ZoneReader) {}

  async execute({ zone, spec }: PlanZoneQuery): Promise<ZonePlanResult> {
    const parsed = parseZoneSpec(spec);
    if (!parsed.ok) return { plan: null, problems: parsed.errors };
    if (parsed.spec.zone.name !== zone)
      return {
        plan: null,
        problems: [
          {
            path: "zone.name",
            message: `this document is for "${parsed.spec.zone.name}", not "${zone}"`,
          },
        ],
      };
    return { plan: planZone(parsed.spec, await this.reader.facts(zone)), problems: [] };
  }
}
