import { type Document, isMap, isSeq } from "yaml";
import { type PortSpec, parsePort } from "./ports.js";

export interface ServiceModel {
  name: string;
  image?: string;
  hasBuild: boolean;
  containerName?: string;
  ports: string[];
  env: [string, string][];
  volumes: string[];
  /** Networks listed explicitly; empty means the project's default network. */
  networks: string[];
  dependsOn: string[];
  restart?: string;
  networkMode?: string;
  privileged: boolean;
  /** Raw extras used by risk checks. */
  capAdd: string[];
  pid?: string;
}

export interface NetworkModel {
  name: string;
  internal: boolean;
  subnet?: string;
}

export interface ComposeModel {
  services: ServiceModel[];
  networks: NetworkModel[];
  volumes: string[];
}

type Plain = Record<string, unknown>;
const obj = (v: unknown): Plain =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Plain) : {};
const str = (v: unknown): string | undefined =>
  typeof v === "string" || typeof v === "number" ? String(v) : undefined;
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter((x): x is string => x !== undefined) : [];
/** A list ("a", "b") or a map (a: {...}) of names. */
const names = (v: unknown): string[] => (Array.isArray(v) ? strList(v) : Object.keys(obj(v)));

const portString = (value: unknown): string | undefined => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  const spec: PortSpec | null = parsePort(value);
  if (!spec) return undefined;
  return [spec.ip, spec.host, spec.container].filter(Boolean).join(":");
};

const envEntries = (v: unknown): [string, string][] => {
  if (Array.isArray(v)) {
    return v.flatMap((e): [string, string][] => {
      const s = str(e);
      if (s === undefined) return [];
      const eq = s.indexOf("=");
      return eq < 0 ? [[s, ""]] : [[s.slice(0, eq), s.slice(eq + 1)]];
    });
  }
  return Object.entries(obj(v)).map(([k, val]) => [
    k,
    val === null || val === undefined ? "" : String(val),
  ]);
};

const volumeString = (v: unknown): string | undefined => {
  if (typeof v === "string") return v;
  const o = obj(v);
  const source = str(o.source);
  const target = str(o.target);
  return target ? (source ? `${source}:${target}` : target) : undefined;
};

/** Reads a parsed document into plain, UI-friendly data. Tolerant: bad shapes become empty fields. */
export const readCompose = (doc: Document): ComposeModel => {
  const root = obj(doc.toJS({ mapAsMap: false }));
  const services = Object.entries(obj(root.services)).map(([name, raw]): ServiceModel => {
    const s = obj(raw);
    const model: ServiceModel = {
      name,
      hasBuild: s.build !== undefined,
      ports: (Array.isArray(s.ports) ? s.ports : [])
        .map(portString)
        .filter((p): p is string => p !== undefined),
      env: envEntries(s.environment),
      volumes: (Array.isArray(s.volumes) ? s.volumes : [])
        .map(volumeString)
        .filter((p): p is string => p !== undefined),
      networks: names(s.networks),
      dependsOn: names(s.depends_on),
      privileged: s.privileged === true,
      capAdd: strList(s.cap_add),
    };
    const image = str(s.image);
    if (image) model.image = image;
    const containerName = str(s.container_name);
    if (containerName) model.containerName = containerName;
    const restart = str(s.restart);
    if (restart) model.restart = restart;
    const networkMode = str(s.network_mode);
    if (networkMode) model.networkMode = networkMode;
    const pid = str(s.pid);
    if (pid) model.pid = pid;
    return model;
  });
  const networks = Object.entries(obj(root.networks)).map(([name, raw]): NetworkModel => {
    const n = obj(raw);
    const subnet = str(obj(strOrFirst(obj(n.ipam).config)).subnet);
    return { name, internal: n.internal === true, ...(subnet ? { subnet } : {}) };
  });
  return { services, networks, volumes: Object.keys(obj(root.volumes)) };
};

const strOrFirst = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

/** True when `services` exists and is a mapping (used to decide whether edits are safe). */
export const hasServicesMap = (doc: Document): boolean => isMap(doc.get("services", true));
export const isSequence = isSeq;
