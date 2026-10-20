import { type DnsRecord, ipFamily } from "@nautix/contracts";
import { BANNER, bySpecificity, type DnsPlan, DnsStrategy } from "../dns-strategy.js";

export const COREFILE = "/etc/coredns/Corefile";

/** `app.lab` → `(^|[.])app[.]lab[.]$`: the name and its subdomains (no backslashes: Corefile quoting stays trivial). */
const matcher = (name: string): string => `(^|[.])${name.split(".").join("[.]")}[.]$`;

/**
 * One `template` block per record and family, most specific names first. A name that has only one
 * family also gets an empty answer for the other one, so clients do not fall through to the upstream
 * and get a different result than the name's owner intended.
 */
export const buildCorefile = (records: DnsRecord[]): string => {
  const blocks: string[] = [];
  const families = new Map<string, Set<4 | 6>>();
  for (const r of records) {
    const set = families.get(r.name) ?? new Set<4 | 6>();
    set.add(ipFamily(r.ip));
    families.set(r.name, set);
  }
  for (const r of bySpecificity(records)) {
    const type = ipFamily(r.ip) === 4 ? "A" : "AAAA";
    blocks.push(
      [
        `    template IN ${type} {`,
        `        match "${matcher(r.name)}"`,
        `        answer "{{ .Name }} 60 IN ${type} ${r.ip}"`,
        "    }",
      ].join("\n"),
    );
  }
  for (const [name, set] of families) {
    if (set.size === 2) continue;
    const missing = set.has(4) ? "AAAA" : "A";
    blocks.push(
      [
        `    template IN ${missing} {`,
        `        match "${matcher(name)}"`,
        "        rcode NOERROR",
        "    }",
      ].join("\n"),
    );
  }
  return [
    `# ${BANNER}`,
    ". {",
    "    errors",
    "    reload 2s 1s",
    ...blocks,
    "    forward . /etc/resolv.conf",
    "    cache 30",
    "}",
    "",
  ].join("\n");
};

/**
 * CoreDNS has no shell, so there is nothing to run: the Corefile is written and the `reload` plugin
 * applies it without dropping a single query. The image cannot start without a Corefile, so the
 * first apply writes into the stopped container and starts it.
 */
export class CorednsStrategy extends DnsStrategy {
  readonly kind = "coredns" as const;
  override readonly writesWhileStopped = true;

  protected build(records: DnsRecord[]): DnsPlan {
    return {
      files: [{ path: COREFILE, content: buildCorefile(records) }],
      commands: [],
      apply: {
        type: "reload",
        ok: /Reloading complete/,
        failed: /(Restart failed|reload failed|Failed to reload|plugin\/reload: .*(fail|error))/i,
        waitMs: 12_000,
      },
    };
  }
}
