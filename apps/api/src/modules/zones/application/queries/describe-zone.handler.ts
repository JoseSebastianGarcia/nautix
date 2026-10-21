import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { describeZone } from "../../domain/describe-zone.js";
import { stringifyZoneSpec } from "../../domain/zone-yaml.js";
import { ZoneStore } from "../ports/zone-store.js";
import { ZoneReader } from "../zone-reader.js";
import { DescribeZoneQuery } from "./describe-zone.query.js";

export interface ZoneDescription {
  /** What is running, as a document. */
  current: string;
  /** The document last applied to this zone, if any. */
  stored: string | null;
  appliedAt: number | null;
}

@QueryHandler(DescribeZoneQuery)
export class DescribeZoneHandler implements IQueryHandler<DescribeZoneQuery, ZoneDescription> {
  constructor(
    @Inject(ZoneReader) private readonly reader: ZoneReader,
    @Inject(ZoneStore) private readonly store: ZoneStore,
  ) {}

  async execute({ zone }: DescribeZoneQuery): Promise<ZoneDescription> {
    const facts = await this.reader.facts(zone);
    const stored = await this.store.get(zone);
    return {
      current: stringifyZoneSpec(describeZone(zone, facts)),
      stored: stored?.yaml ?? null,
      appliedAt: stored?.appliedAt ?? null,
    };
  }
}
