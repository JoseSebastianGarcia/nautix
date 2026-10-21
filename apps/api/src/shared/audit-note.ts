import type { ChangeExposure, GuardRule, ZoneActionResult } from "@nautix/contracts";
import type { Request } from "express";

/**
 * What a controller tells the audit trail about the request it handled: a one-line description that
 * names what was touched. Names only, never values: environment values, passwords and tokens must not
 * end up in a second place where someone can read them.
 */
export interface AuditNote {
  detail: string;
  /** The request changes nothing (a plan, a preview): leave it out of the trail. */
  skip?: boolean;
  /** A read of something sensitive; recorded even though it is a GET, and not repeated within ten minutes. */
  read?: boolean;
}

type NotedRequest = Request & { auditNote?: AuditNote };

export const setAuditNote = (req: Request, note: AuditNote): void => {
  (req as NotedRequest).auditNote = note;
};

export const getAuditNote = (req: Request): AuditNote | undefined =>
  (req as NotedRequest).auditNote;

const MAX = 480;
const clip = (text: string): string => (text.length > MAX ? `${text.slice(0, MAX - 1)}…` : text);
const list = (names: readonly string[]): string => (names.length > 0 ? names.join(",") : "-");

export const envDetail = (container: string, set: readonly string[], unset: readonly string[]) =>
  clip(`env container=${container} set=${list(set)} unset=${list(unset)}`);

export const envReadDetail = (container: string): string => `read env container=${container}`;

export const exposureDetail = (container: string, ports: ChangeExposure["ports"]): string =>
  clip(
    `exposure container=${container} ${ports
      .map(
        (p) =>
          `${p.containerPort}/${p.protocol}=${p.exposure.kind === "address" ? p.exposure.address : p.exposure.kind}`,
      )
      .join(" ")}`,
  );

export const bindingDetail = (
  verb: "create" | "reapply" | "delete",
  b: { consumer: string; provider: string; name: string; style?: string },
): string =>
  clip(
    `binding ${verb} consumer=${b.consumer} provider=${b.provider} name=${b.name}${b.style ? ` style=${b.style}` : ""}`,
  );

const actionLine = (r: ZoneActionResult): string => {
  const a = r.action;
  switch (a.kind) {
    case "create-network":
      return `${a.kind}:${a.name}`;
    case "create-service":
    case "remove-service":
      return `${a.kind}:${a.service}`;
    case "update-service":
    case "replace-service":
      return `${a.kind}:${a.service}(${a.fields.join("+")})`;
    default:
      return `${a.kind}:${a.consumer}>${a.provider}`;
  }
};

export const zoneDetail = (
  zone: string,
  allowRemovals: boolean,
  results: readonly ZoneActionResult[],
): string => {
  const count = (status: ZoneActionResult["status"]) =>
    results.filter((r) => r.status === status).length;
  const failed = results.find((r) => r.status === "failed");
  return clip(
    `zone apply zone=${zone} done=${count("done")} failed=${count("failed")} skipped=${count("skipped")} removals=${allowRemovals ? "yes" : "no"}` +
      (failed ? ` failed-at=${actionLine(failed)}` : "") +
      ` actions=${results.map((r) => `${actionLine(r)}[${r.status}]`).join(" ")}`,
  );
};

export const zoneReadDetail = (zone: string): string => `read zone=${zone}`;

export const guardRulesDetail = (rules: readonly GuardRule[]): string =>
  clip(
    `guard rules count=${rules.length} ${rules
      .map((r) => `${r.container}:${r.port}/${r.protocol}<-${r.allow.join(",")}`)
      .join(" ")}`,
  );

export const volumeDownloadDetail = (volume: string, path: string): string =>
  clip(`volume download volume=${volume} path=${path}`);

export const volumeUploadDetail = (volume: string, path: string): string =>
  clip(`volume upload volume=${volume} into=${path}`);
