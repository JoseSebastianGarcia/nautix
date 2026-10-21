import { createHash } from "node:crypto";
import {
  defaultBindingName,
  type ServiceSpec,
  type ZoneAction,
  type ZoneNote,
  type ZonePlan,
  type ZoneSpec,
} from "@nautix/contracts";
import { describeZone, type ZoneFacts } from "./describe-zone.js";

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const label = (b: { to: string; name?: string | undefined }): string =>
  b.name ?? defaultBindingName(b.to);

/** How a service differs from what is running: what can change in place, and what needs a new container. */
const diffService = (
  want: ServiceSpec,
  have: ServiceSpec,
): { update: string[]; replace: string[] } => {
  const update: string[] = [];
  const replace: string[] = [];
  if (want.image !== have.image) update.push("image");
  if (!same(sortKeys(want.env), sortKeys(have.env))) update.push("env");
  if (!same(want.command ?? null, have.command ?? null)) update.push("command");
  if (want.restart !== have.restart) update.push("restart");
  if (!same([...want.volumes].sort(), [...have.volumes].sort())) replace.push("volumes");

  const haveByKey = new Map(have.ports.map((p) => [`${p.container}/${p.protocol}`, p]));
  const wantKeys = want.ports.map((p) => `${p.container}/${p.protocol}`).sort();
  if (!same(wantKeys, [...haveByKey.keys()].sort())) replace.push("ports");
  else if (
    want.ports.some((p) => {
      const current = haveByKey.get(`${p.container}/${p.protocol}`);
      return (
        current !== undefined &&
        (p.expose !== current.expose || (p.host !== undefined && p.host !== current.host))
      );
    })
  )
    update.push("ports");
  return { update, replace };
};

const sortKeys = (o: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

/**
 * What it takes to make reality match the document. Pure: reality comes in as `facts`. An empty list
 * of actions means nothing to do, and the plan right after a successful apply is empty.
 */
export const planZone = (desired: ZoneSpec, facts: ZoneFacts): ZonePlan => {
  const actual = describeZone(desired.zone.name, facts);
  const actions: ZoneAction[] = [];
  const warnings: ZoneNote[] = [];
  const errors: ZoneNote[] = [];

  if (!facts.network)
    actions.push({
      kind: "create-network",
      name: desired.zone.name,
      internal: desired.zone.internal,
    });
  else if (facts.network.internal !== desired.zone.internal)
    warnings.push({ key: "networkInternalIgnored", params: { zone: desired.zone.name } });

  const wanted = Object.entries(desired.services);
  const creates: ZoneAction[] = [];
  const replaces: ZoneAction[] = [];
  const updates: ZoneAction[] = [];
  const replaced = new Set<string>();
  const changedEnv = new Set<string>();

  for (const [name, want] of wanted) {
    const have = actual.services[name];
    if (!have) {
      if (facts.outside.includes(name))
        errors.push({ key: "nameTakenOutside", params: { service: name } });
      else creates.push({ kind: "create-service", service: name });
      continue;
    }
    const { update, replace } = diffService(want, have);
    if (replace.length > 0) {
      replaces.push({ kind: "replace-service", service: name, fields: [...replace, ...update] });
      replaced.add(name);
      changedEnv.add(name);
      if (facts.containers.find((c) => c.name === name)?.volumes.some((v) => !v.includes(":")))
        warnings.push({ key: "anonymousVolumeLost", params: { service: name } });
    } else if (update.length > 0) {
      updates.push({ kind: "update-service", service: name, fields: update });
      if (update.includes("env") || update.includes("image") || update.includes("ports"))
        changedEnv.add(name);
    }
  }

  // Bindings: compare by consumer and label; a replaced or new consumer starts from none.
  const bindingActions: ZoneAction[] = [];
  const removeBindings: ZoneAction[] = [];
  for (const [consumer, want] of wanted) {
    const have = actual.services[consumer];
    const existing = replaced.has(consumer) || !have ? [] : have.bindings;
    for (const b of want.bindings) {
      const current = existing.find((e) => label(e) === label(b));
      const base = { consumer, provider: b.to, name: label(b) };
      if (!current) bindingActions.push({ kind: "add-binding", ...base, style: b.style });
      else if (current.to !== b.to || current.style !== b.style) {
        removeBindings.push({
          kind: "remove-binding",
          consumer,
          provider: current.to,
          name: label(current),
        });
        bindingActions.push({ kind: "add-binding", ...base, style: b.style });
      } else if (changedEnv.has(b.to)) bindingActions.push({ kind: "reapply-binding", ...base });
    }
    for (const e of existing)
      if (!want.bindings.some((b) => label(b) === label(e)))
        removeBindings.push({ kind: "remove-binding", consumer, provider: e.to, name: label(e) });
  }

  const removals: ZoneAction[] = [];
  for (const name of Object.keys(actual.services))
    if (!(name in desired.services)) {
      removals.push({ kind: "remove-service", service: name });
      warnings.push({ key: "removesService", params: { service: name } });
    }

  actions.push(
    ...creates,
    ...replaces,
    ...updates,
    ...removeBindings,
    ...bindingActions,
    ...removals,
  );

  const hash = createHash("sha256")
    .update(JSON.stringify({ actions, errors }))
    .digest("hex")
    .slice(0, 16);
  return { actions, warnings, errors, hash };
};
