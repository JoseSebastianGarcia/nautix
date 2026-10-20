import type { Document } from "yaml";
import { type ComposeModel, readCompose } from "./model.js";
import { isPublic, parsePort } from "./ports.js";

export type IssueLevel = "error" | "warning" | "risk";

export interface Issue {
  level: IssueLevel;
  /** Stable code; the UI translates `compose.issue.<code>`. */
  code: string;
  service?: string;
  params?: Record<string, string>;
}

const DEFAULT_NETWORK = "default";
const SOCKET = /docker\.sock/;
const DANGEROUS_CAPS = new Set(["SYS_ADMIN", "ALL", "NET_ADMIN", "SYS_PTRACE"]);

export const validateModel = (model: ComposeModel): Issue[] => {
  const issues: Issue[] = [];
  const add = (
    level: IssueLevel,
    code: string,
    service?: string,
    params?: Record<string, string>,
  ) => issues.push({ level, code, ...(service ? { service } : {}), ...(params ? { params } : {}) });

  if (model.services.length === 0) add("error", "noServices");

  const serviceNames = new Set(model.services.map((s) => s.name));
  const networkNames = new Set([...model.networks.map((n) => n.name), DEFAULT_NETWORK]);
  const hostPorts = new Map<string, string>();
  const containerNames = new Map<string, string>();

  for (const s of model.services) {
    if (!s.image && !s.hasBuild) add("error", "noImage", s.name);
    for (const dep of s.dependsOn)
      if (!serviceNames.has(dep)) add("error", "unknownDependency", s.name, { target: dep });
    for (const net of s.networks)
      if (!networkNames.has(net)) add("error", "unknownNetwork", s.name, { target: net });

    if (s.containerName) {
      const other = containerNames.get(s.containerName);
      if (other) add("error", "duplicateContainerName", s.name, { name: s.containerName, other });
      containerNames.set(s.containerName, s.name);
    }

    for (const raw of s.ports) {
      const spec = parsePort(raw);
      if (!spec) {
        add("error", "invalidPort", s.name, { port: raw });
        continue;
      }
      if (isPublic(spec) && spec.host !== undefined)
        add("warning", "publicPort", s.name, { port: raw });
      if (spec.host !== undefined) {
        const key = `${spec.ip ?? "*"}:${spec.host}/${spec.protocol}`;
        const other = hostPorts.get(key);
        if (other && other !== s.name)
          add("error", "duplicateHostPort", s.name, { port: spec.host, other });
        hostPorts.set(key, s.name);
      }
    }

    for (const v of s.volumes) {
      if (/^\.{1,2}\//.test(v)) add("warning", "relativeBind", s.name, { volume: v });
      if (SOCKET.test(v)) add("risk", "dockerSocket", s.name);
    }
    if (s.privileged) add("risk", "privileged", s.name);
    if (s.networkMode === "host") add("risk", "hostNetwork", s.name);
    if (s.pid === "host") add("risk", "hostPid", s.name);
    if (s.capAdd.some((c) => DANGEROUS_CAPS.has(c.toUpperCase())))
      add("risk", "dangerousCap", s.name);
  }
  return issues;
};

/** Syntax errors, then model checks. Risks need an explicit acknowledgement before `up`. */
export const validateCompose = (doc: Document): Issue[] => {
  if (doc.errors.length > 0) {
    return doc.errors.map((e) => ({
      level: "error" as const,
      code: "yaml",
      params: { message: e.message.split("\n")[0] ?? "" },
    }));
  }
  return validateModel(readCompose(doc));
};

export const hasRisks = (issues: Issue[]): boolean => issues.some((i) => i.level === "risk");
