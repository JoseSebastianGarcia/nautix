import {
  type Binding,
  bindAddressOf,
  CreateBinding,
  CreateContainer,
  type Exposure,
  type ServiceSpec,
  type SpecExpose,
  type ZoneAction,
  type ZoneActionResult,
  type ZoneSpec,
} from "@nautix/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { CreateBindingCommand } from "../../bindings/application/commands/create-binding.command.js";
import { DeleteBindingCommand } from "../../bindings/application/commands/delete-binding.command.js";
import { ReapplyBindingCommand } from "../../bindings/application/commands/reapply-binding.command.js";
import { ListBindingsQuery } from "../../bindings/application/queries/list-bindings.query.js";
import { CreateContainerCommand } from "../../docker/application/commands/create-container.command.js";
import { CreateNetworkCommand } from "../../docker/application/commands/create-network.command.js";
import { RecreateContainerCommand } from "../../docker/application/commands/recreate-container.command.js";
import { RemoveContainerCommand } from "../../docker/application/commands/remove-container.command.js";
import { UpdateContainerCommand } from "../../docker/application/commands/update-container.command.js";
import type { ContainerChange } from "../../docker/domain/recreate.js";
import { describeZone } from "../domain/describe-zone.js";
import type { ZoneReader } from "./zone-reader.js";

const exposureOf = (e: SpecExpose): Exposure =>
  e === "local"
    ? { kind: "local" }
    : e === "open"
      ? { kind: "open" }
      : { kind: "address", address: e };

/** Container request for a service of the document. */
const createRequest = (name: string, s: ServiceSpec, networkId: string | null) =>
  CreateContainer.parse({
    name,
    image: s.image,
    networkId,
    env: s.env,
    ports: s.ports.map((p) => ({
      containerPort: p.container,
      protocol: p.protocol,
      ...(p.host !== undefined ? { hostPort: p.host } : {}),
      exposePublicly: p.expose === "open",
      ...(p.expose !== "local" && p.expose !== "open" ? { bindAddress: p.expose } : {}),
    })),
    restartPolicy: s.restart,
    ...(s.command ? { command: s.command } : {}),
    volumes: s.volumes,
    start: true,
  });

type Facts = Awaited<ReturnType<ZoneReader["facts"]>>;

/** Runs a plan against the engine, one action at a time, stopping at the first failure. */
@Injectable()
export class ZoneApplier {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  async run(
    spec: ZoneSpec,
    actions: ZoneAction[],
    facts: Facts,
    allowRemovals: boolean,
  ): Promise<ZoneActionResult[]> {
    const actual = describeZone(spec.zone.name, facts);
    const results: ZoneActionResult[] = [];
    let networkId = facts.networkId;
    let failed = false;
    for (const action of actions) {
      if (failed) {
        results.push({ action, status: "skipped", detail: "stopped after an earlier failure" });
        continue;
      }
      if (action.kind === "remove-service" && !allowRemovals) {
        results.push({ action, status: "skipped", detail: "removals were not allowed" });
        continue;
      }
      try {
        networkId = await this.perform(action, spec, actual, facts, networkId);
        results.push({ action, status: "done" });
      } catch (error) {
        failed = true;
        results.push({
          action,
          status: "failed",
          detail: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  /** Returns the network id (it is known after `create-network`). */
  private async perform(
    action: ZoneAction,
    spec: ZoneSpec,
    actual: ZoneSpec,
    facts: Facts,
    networkId: string | null,
  ): Promise<string | null> {
    const idOf = (service: string): string => facts.ids.get(service) ?? service;
    switch (action.kind) {
      case "create-network": {
        const created = await this.commands.execute<CreateNetworkCommand, { id: string }>(
          new CreateNetworkCommand({ name: action.name, internal: action.internal }),
        );
        return created.id;
      }
      case "create-service": {
        const svc = spec.services[action.service] as ServiceSpec;
        await this.commands.execute(
          new CreateContainerCommand(createRequest(action.service, svc, networkId)),
        );
        return networkId;
      }
      case "replace-service": {
        const svc = spec.services[action.service] as ServiceSpec;
        await this.commands.execute(new RemoveContainerCommand(idOf(action.service), true));
        await this.dropBindingsOf(action.service);
        await this.commands.execute(
          new CreateContainerCommand(createRequest(action.service, svc, networkId)),
        );
        return networkId;
      }
      case "update-service": {
        const want = spec.services[action.service] as ServiceSpec;
        const have = actual.services[action.service] as ServiceSpec;
        if (action.fields.length === 1 && action.fields[0] === "restart") {
          await this.commands.execute(
            new UpdateContainerCommand(idOf(action.service), { restartPolicy: want.restart }),
          );
          return networkId;
        }
        await this.commands.execute(
          new RecreateContainerCommand(idOf(action.service), changeFor(action.fields, want, have)),
        );
        return networkId;
      }
      case "remove-service":
        await this.commands.execute(new RemoveContainerCommand(idOf(action.service), true));
        await this.dropBindingsOf(action.service);
        return networkId;
      case "add-binding":
        await this.commands.execute(
          new CreateBindingCommand(
            CreateBinding.parse({
              consumer: action.consumer,
              provider: action.provider,
              name: action.name,
              style: action.style,
            }),
          ),
        );
        return networkId;
      case "remove-binding": {
        const b = await this.find(action);
        if (b) await this.commands.execute(new DeleteBindingCommand(b.id));
        return networkId;
      }
      case "reapply-binding": {
        const b = await this.find(action);
        if (b) await this.commands.execute(new ReapplyBindingCommand(b.id));
        return networkId;
      }
    }
  }

  private async find(a: {
    consumer: string;
    provider: string;
    name: string;
  }): Promise<Binding | undefined> {
    const all = await this.queries.execute<ListBindingsQuery, Binding[]>(new ListBindingsQuery());
    return all.find(
      (b) => b.consumer === a.consumer && b.provider === a.provider && b.name === a.name,
    );
  }

  /** The container is gone, so its bindings as a consumer are just records to delete. */
  private async dropBindingsOf(service: string): Promise<void> {
    const all = await this.queries.execute<ListBindingsQuery, Binding[]>(new ListBindingsQuery());
    for (const b of all.filter((x) => x.consumer === service))
      await this.commands.execute(new DeleteBindingCommand(b.id));
  }
}

/** The recreate that turns what runs into what the document says, for the fields that differ. */
export const changeFor = (
  fields: string[],
  want: ServiceSpec,
  have: ServiceSpec,
): ContainerChange => {
  const change: ContainerChange = {};
  if (fields.includes("image")) change.image = want.image;
  if (fields.includes("command") && want.command) change.command = want.command;
  if (fields.includes("restart")) change.restart = want.restart;
  if (fields.includes("env")) {
    const env: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(want.env)) if (have.env[k] !== v) env[k] = v;
    for (const k of Object.keys(have.env)) if (!(k in want.env)) env[k] = null;
    change.env = env;
  }
  if (fields.includes("ports"))
    change.ports = want.ports.map((p) => ({
      containerPort: p.container,
      protocol: p.protocol,
      hostIp: bindAddressOf(exposureOf(p.expose)),
      ...(p.host !== undefined ? { hostPort: p.host } : {}),
    }));
  return change;
};
