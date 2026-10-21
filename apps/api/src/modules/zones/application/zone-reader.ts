import {
  type Binding,
  type Container,
  type ContainerDetails,
  type Network,
  tunnelFromContainer,
} from "@nautix/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { ListBindingsQuery } from "../../bindings/application/queries/list-bindings.query.js";
import { GetContainerDetailsQuery } from "../../docker/application/queries/get-container-details.query.js";
import { ListContainersQuery } from "../../docker/application/queries/list-containers.query.js";
import { ListNetworksQuery } from "../../docker/application/queries/list-networks.query.js";
import { volumeString, type ZoneContainer, type ZoneFacts } from "../domain/describe-zone.js";

/** Reads reality (containers, networks, details, bindings) into the facts the planner works on. */
@Injectable()
export class ZoneReader {
  constructor(@Inject(QueryBus) private readonly queries: QueryBus) {}

  async facts(
    zone: string,
  ): Promise<
    ZoneFacts & { containers: ZoneContainer[]; ids: Map<string, string>; networkId: string | null }
  > {
    const [containers, networks, bindings] = await Promise.all([
      this.queries.execute<ListContainersQuery, Container[]>(new ListContainersQuery()),
      this.queries.execute<ListNetworksQuery, Network[]>(new ListNetworksQuery()),
      this.queries.execute<ListBindingsQuery, Binding[]>(new ListBindingsQuery()),
    ]);
    const network = networks.find((n) => n.name === zone && !n.system) ?? null;
    const members = containers.filter(
      (c) =>
        network !== null &&
        c.networks.includes(zone) &&
        !c.isSelf &&
        tunnelFromContainer(c) === null,
    );
    const details =
      members.length === 0
        ? []
        : await this.queries.execute<GetContainerDetailsQuery, ContainerDetails[]>(
            new GetContainerDetailsQuery(members.map((c) => c.id)),
          );
    const byId = new Map(details.map((d) => [d.id, d]));
    const described: ZoneContainer[] = members.map((c) => {
      const d = byId.get(c.id);
      return {
        name: c.name,
        image: c.image,
        env: d?.env ?? {},
        command: d?.command ?? null,
        restartPolicy: d?.restartPolicy ?? "no",
        volumes: (d?.mounts ?? []).flatMap((m) => volumeString(m) ?? []),
        ports: c.ports,
      };
    });
    const inside = new Set(members.map((c) => c.id));
    return {
      network: network ? { name: network.name, internal: network.internal } : null,
      containers: described,
      outside: containers.filter((c) => !inside.has(c.id)).map((c) => c.name),
      bindings: bindings.filter((b) => described.some((c) => c.name === b.consumer)),
      ids: new Map(members.map((c) => [c.name, c.id])),
      networkId: network?.id ?? null,
    };
  }
}
