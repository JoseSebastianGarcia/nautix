import { type DnsKind, type DnsRecord, HOSTNAME, isIpAddress } from "@nautix/contracts";
import { ValidationError } from "../../../shared/domain-error.js";
import type { TarFile } from "./tar.js";

/** How a DNS server picks up new records after Nautix has written its files. */
export type DnsApply =
  | { type: "restart" }
  | {
      /** The server reloads its own configuration; Nautix watches the logs for the outcome. */
      type: "reload";
      ok: RegExp;
      failed: RegExp;
      waitMs: number;
    };

export interface DnsPlan {
  files: TarFile[];
  /** Commands run inside the container after the files are written; each must exit 0. */
  commands: string[][];
  apply: DnsApply;
}

/**
 * Strategy: one implementation per DNS server. Adding a server means adding a class and listing it
 * in the registry; the handler, the controller and the page do not change.
 */
export abstract class DnsStrategy {
  abstract readonly kind: DnsKind;

  /**
   * Whether files can be written to a stopped container (which is then started). Needed by images
   * that cannot start without a configuration file, such as CoreDNS.
   */
  readonly writesWhileStopped: boolean = false;

  /** Turns validated records into the delivery plan for this server. */
  plan(records: DnsRecord[]): DnsPlan {
    for (const r of records)
      if (!HOSTNAME.test(r.name) || !isIpAddress(r.ip))
        throw new ValidationError(`invalid record ${r.name} → ${r.ip}`, "errors.dnsInvalidRecord");
    return this.build(records);
  }

  protected abstract build(records: DnsRecord[]): DnsPlan;
}

/** Most specific names first: a record for `db.app.lab` must beat the one for `app.lab`. */
export const bySpecificity = (records: DnsRecord[]): DnsRecord[] =>
  [...records].sort(
    (a, b) =>
      b.name.split(".").length - a.name.split(".").length ||
      a.name.localeCompare(b.name) ||
      a.ip.localeCompare(b.ip),
  );

export const BANNER =
  "Managed by Nautix. Edit the records in the DNS tab; manual changes are overwritten.";
