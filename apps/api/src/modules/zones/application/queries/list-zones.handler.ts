import type { Network } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryBus, QueryHandler } from "@nestjs/cqrs";
import { ListNetworksQuery } from "../../../docker/application/queries/list-networks.query.js";
import { planZone } from "../../domain/plan-zone.js";
import { parseZoneSpec } from "../../domain/zone-yaml.js";
import { ZoneStore } from "../ports/zone-store.js";
import { ZoneReader } from "../zone-reader.js";
import { ListZonesQuery } from "./list-zones.query.js";

export interface ZoneSummary {
  name: string;
  /** A document was applied to this zone before. */
  hasSpec: boolean;
  /** Reality no longer matches that document: number of actions it would take. */
  drift: number;
}

/** The zones (user networks), and for those with a document, whether reality has drifted from it. */
@QueryHandler(ListZonesQuery)
export class ListZonesHandler implements IQueryHandler<ListZonesQuery, ZoneSummary[]> {
  constructor(
    @Inject(QueryBus) private readonly queries: QueryBus,
    @Inject(ZoneReader) private readonly reader: ZoneReader,
    @Inject(ZoneStore) private readonly store: ZoneStore,
  ) {}

  async execute(): Promise<ZoneSummary[]> {
    const networks = await this.queries.execute<ListNetworksQuery, Network[]>(
      new ListNetworksQuery(),
    );
    const names = [
      ...new Set([
        ...networks.filter((n) => !n.system).map((n) => n.name),
        ...(await this.store.names()),
      ]),
    ];
    const out: ZoneSummary[] = [];
    for (const name of names.sort()) {
      const stored = await this.store.get(name);
      const parsed = stored ? parseZoneSpec(stored.yaml) : null;
      const drift =
        parsed?.ok === true
          ? planZone(parsed.spec, await this.reader.facts(name)).actions.length
          : 0;
      out.push({ name, hasSpec: stored !== null, drift });
    }
    return out;
  }
}
