import { type Document, isMap, isScalar, isSeq, parseDocument, Scalar, type YAMLMap } from "yaml";

/** Parses without throwing; syntax problems are reported through `doc.errors`. */
export const parse = (text: string): Document => parseDocument(text);

/** Applies a patch to a text and returns the new text. Comments, order and anchors survive. */
export const edit = (text: string, patch: (doc: Document) => void): string => {
  const doc = parse(text);
  if (doc.errors.length > 0) return text; // never "fix" a broken file behind the user's back
  patch(doc);
  // The library pads flow collections by default; keep whichever style the file already uses.
  return doc.toString({ lineWidth: 0, flowCollectionPadding: /\[ \S|\{ \S/.test(text) });
};

const servicesMap = (doc: Document, create = false): YAMLMap | null => {
  const existing = doc.get("services", true);
  if (isMap(existing)) return existing as YAMLMap;
  if (!create) return null;
  doc.set("services", doc.createNode({}));
  return doc.get("services", true) as YAMLMap;
};

/** A pre-existing empty `{}` is written in flow style; once it has content it should read as a block. */
const blockStyle = (map: YAMLMap): void => {
  if (map.flow) map.flow = false;
};

/** Ports like 8080:80 are quoted so no parser reads them as base-60 numbers (what the Docker docs advise). */
const quotePorts = (node: unknown): void => {
  const ports = isMap(node) ? node.get("ports", true) : null;
  if (!isSeq(ports)) return;
  for (const item of ports.items)
    if (isScalar(item) && typeof item.value === "string") item.type = Scalar.QUOTE_DOUBLE;
};

export const addService = (
  doc: Document,
  name: string,
  definition: Record<string, unknown>,
): void => {
  const services = servicesMap(doc, true);
  if (!services || services.has(name)) return;
  services.set(name, doc.createNode(definition));
  blockStyle(services);
  quotePorts(services.get(name, true));
};

/** Removes every reference to `name` from a `depends_on`-style list or map under each service. */
const dropReference = (doc: Document, key: "depends_on" | "networks", name: string): void => {
  const services = servicesMap(doc);
  for (const pair of services?.items ?? []) {
    const service = pair.value;
    if (!isMap(service)) continue;
    const refs = service.get(key, true);
    if (isSeq(refs)) {
      refs.items = refs.items.filter((i) => !(isScalar(i) && i.value === name));
    } else if (isMap(refs)) {
      refs.items = refs.items.filter((p) => !(isScalar(p.key) && p.key.value === name));
    }
    const left = service.get(key, true);
    if ((isSeq(left) || isMap(left)) && left.items.length === 0) service.delete(key);
  }
};

export const removeService = (doc: Document, name: string): void => {
  servicesMap(doc)?.delete(name);
  dropReference(doc, "depends_on", name);
};

export const renameService = (doc: Document, from: string, to: string): void => {
  const services = servicesMap(doc);
  if (!services || from === to || services.has(to)) return;
  const pair = services.items.find((p) => isScalar(p.key) && p.key.value === from);
  if (!pair || !isScalar(pair.key)) return;
  pair.key.value = to;
  for (const other of services.items) {
    if (!isMap(other.value)) continue;
    const deps = other.value.get("depends_on", true);
    if (isSeq(deps)) for (const i of deps.items) if (isScalar(i) && i.value === from) i.value = to;
    if (isMap(deps))
      for (const p of deps.items) if (isScalar(p.key) && p.key.value === from) p.key.value = to;
  }
};

const serviceMap = (doc: Document, name: string): YAMLMap | null => {
  const node = servicesMap(doc)?.get(name, true);
  return isMap(node) ? (node as YAMLMap) : null;
};

/** Sets a scalar key on a service; undefined or empty removes it. */
export const setServiceScalar = (
  doc: Document,
  service: string,
  key: string,
  value: string | undefined,
): void => {
  const map = serviceMap(doc, service);
  if (!map) return;
  if (value === undefined || value === "") map.delete(key);
  else map.set(key, value);
};

export const setServiceBool = (
  doc: Document,
  service: string,
  key: string,
  value: boolean,
): void => {
  const map = serviceMap(doc, service);
  if (!map) return;
  if (value) map.set(key, true);
  else map.delete(key);
};

/** Replaces a list-valued key (ports, volumes, networks…); an empty list removes the key. */
export const setServiceList = (
  doc: Document,
  service: string,
  key: string,
  items: string[],
): void => {
  const map = serviceMap(doc, service);
  if (!map) return;
  if (items.length === 0) map.delete(key);
  else map.set(key, doc.createNode(items));
  if (key === "ports") quotePorts(map);
};

/** Writes `environment` in map form; an empty list removes the key. */
export const setServiceEnv = (
  doc: Document,
  service: string,
  entries: [string, string][],
): void => {
  const map = serviceMap(doc, service);
  if (!map) return;
  const clean = entries.filter(([k]) => k.trim() !== "");
  if (clean.length === 0) map.delete("environment");
  else
    map.set(
      "environment",
      doc.createNode(Object.fromEntries(clean.map(([k, v]) => [k.trim(), v]))),
    );
};

export const addNetwork = (
  doc: Document,
  name: string,
  opts: { internal?: boolean; subnet?: string } = {},
): void => {
  if (!isMap(doc.get("networks", true))) doc.set("networks", doc.createNode({}));
  const networks = doc.get("networks", true) as YAMLMap;
  if (networks.has(name)) return;
  const definition: Record<string, unknown> = {};
  if (opts.internal) definition.internal = true;
  if (opts.subnet) definition.ipam = { config: [{ subnet: opts.subnet }] };
  networks.set(name, doc.createNode(definition));
  blockStyle(networks);
};

export const removeNetwork = (doc: Document, name: string): void => {
  const networks = doc.get("networks", true);
  if (isMap(networks)) {
    networks.delete(name);
    if (networks.items.length === 0) doc.delete("networks");
  }
  dropReference(doc, "networks", name);
};

export const setNetworkInternal = (doc: Document, name: string, internal: boolean): void => {
  const networks = doc.get("networks", true);
  if (!isMap(networks)) return;
  const node = networks.get(name, true);
  if (isMap(node)) {
    if (internal) node.set("internal", true);
    else node.delete("internal");
  } else if (internal) {
    networks.set(name, doc.createNode({ internal: true }));
  }
};

export const addNamedVolume = (doc: Document, name: string): void => {
  if (!isMap(doc.get("volumes", true))) doc.set("volumes", doc.createNode({}));
  const volumes = doc.get("volumes", true) as YAMLMap;
  if (!volumes.has(name)) volumes.set(name, doc.createNode({}));
  blockStyle(volumes);
};
