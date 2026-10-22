import type {
  SwarmHealthcheck,
  SwarmMount,
  SwarmPort,
  SwarmResources,
  SwarmUpdatePolicy,
} from "@nautix/contracts";
import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "../../components/ui.js";

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : undefined;
};

const Small = ({ label, children }: { label: string; children: ReactNode }) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the labelled control is passed in as children
  <label className="flex flex-col gap-1 text-xs text-dim">
    {label}
    {children}
  </label>
);

export const DEFAULT_HEALTHCHECK: SwarmHealthcheck = {
  command: "",
  intervalSeconds: 30,
  timeoutSeconds: 10,
  retries: 3,
  startPeriodSeconds: 0,
};

/** A command that must exit 0 for the copy to count as healthy; an unhealthy copy is replaced. */
export function HealthcheckFields({
  value,
  onChange,
}: {
  value: SwarmHealthcheck | null;
  onChange: (next: SwarmHealthcheck | null) => void;
}) {
  const { t } = useTranslation();
  const set = (patch: Partial<SwarmHealthcheck>) => value && onChange({ ...value, ...patch });
  const int = (v: string, min: number, fallback: number): number =>
    Math.max(min, Math.floor(Number(v)) || fallback);
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(e) => onChange(e.target.checked ? DEFAULT_HEALTHCHECK : null)}
        />
        {t("swarmCanvas.healthEnable")}
      </label>
      {value && (
        <>
          <Small label={t("swarmCanvas.healthCommand")}>
            <Input
              value={value.command}
              placeholder="curl -f http://localhost/ || exit 1"
              onChange={(e) => set({ command: e.target.value })}
            />
          </Small>
          <div className="grid grid-cols-4 gap-2">
            <Small label={t("swarmCanvas.healthInterval")}>
              <Input
                type="number"
                min={1}
                value={value.intervalSeconds}
                onChange={(e) => set({ intervalSeconds: int(e.target.value, 1, 30) })}
              />
            </Small>
            <Small label={t("swarmCanvas.healthTimeout")}>
              <Input
                type="number"
                min={1}
                value={value.timeoutSeconds}
                onChange={(e) => set({ timeoutSeconds: int(e.target.value, 1, 10) })}
              />
            </Small>
            <Small label={t("swarmCanvas.healthRetries")}>
              <Input
                type="number"
                min={1}
                value={value.retries}
                onChange={(e) => set({ retries: int(e.target.value, 1, 3) })}
              />
            </Small>
            <Small label={t("swarmCanvas.healthStart")}>
              <Input
                type="number"
                min={0}
                value={value.startPeriodSeconds}
                onChange={(e) => set({ startPeriodSeconds: int(e.target.value, 0, 0) })}
              />
            </Small>
          </div>
        </>
      )}
    </div>
  );
}

/** Limits cap a copy; reservations are what the scheduler sets aside for it on a node. */
export function ResourcesFields({
  value,
  onChange,
}: {
  value: SwarmResources;
  onChange: (next: SwarmResources) => void;
}) {
  const { t } = useTranslation();
  const put = (key: keyof SwarmResources, raw: string, whole: boolean) => {
    const n = num(raw);
    const { [key]: _old, ...rest } = value;
    onChange(n === undefined ? rest : { ...rest, [key]: whole ? Math.floor(n) : n });
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Small label={t("swarmCanvas.cpuLimit")}>
        <Input
          inputMode="decimal"
          placeholder="0.5"
          value={value.cpuLimit ?? ""}
          onChange={(e) => put("cpuLimit", e.target.value, false)}
        />
      </Small>
      <Small label={t("swarmCanvas.memoryLimit")}>
        <Input
          inputMode="numeric"
          placeholder="256"
          value={value.memoryLimitMb ?? ""}
          onChange={(e) => put("memoryLimitMb", e.target.value, true)}
        />
      </Small>
      <Small label={t("swarmCanvas.cpuReserve")}>
        <Input
          inputMode="decimal"
          value={value.cpuReserve ?? ""}
          onChange={(e) => put("cpuReserve", e.target.value, false)}
        />
      </Small>
      <Small label={t("swarmCanvas.memoryReserve")}>
        <Input
          inputMode="numeric"
          value={value.memoryReserveMb ?? ""}
          onChange={(e) => put("memoryReserveMb", e.target.value, true)}
        />
      </Small>
    </div>
  );
}

/** How a change of the service rolls out. `auto` (create only) picks stop-first for volumes, start-first otherwise. */
export function PolicyFields({
  value,
  onChange,
  allowAuto = false,
}: {
  value: SwarmUpdatePolicy;
  onChange: (next: SwarmUpdatePolicy) => void;
  allowAuto?: boolean;
}) {
  const { t } = useTranslation();
  const select = "rounded-lg border border-line bg-bg0 px-2 py-1.5 text-sm";
  const int = (v: string, min: number, fallback: number): number =>
    Math.max(min, Math.floor(Number(v)) || fallback);
  const parallelism = value.parallelism ?? 1;
  const delaySeconds = value.delaySeconds ?? 5;
  const monitorSeconds = value.monitorSeconds ?? 10;
  const failureAction = value.failureAction ?? "rollback";
  return (
    <div className="grid grid-cols-2 gap-2">
      <Small label={t("swarmCanvas.order")}>
        <select
          className={select}
          value={value.order ?? "auto"}
          onChange={(e) => {
            const { order: _o, ...rest } = value;
            onChange(
              e.target.value === "auto"
                ? rest
                : { ...rest, order: e.target.value as "start-first" | "stop-first" },
            );
          }}
        >
          {allowAuto && <option value="auto">{t("swarmCanvas.orderAuto")}</option>}
          <option value="start-first">{t("swarmCanvas.orderStart")}</option>
          <option value="stop-first">{t("swarmCanvas.orderStop")}</option>
        </select>
      </Small>
      <Small label={t("swarmCanvas.failureAction")}>
        <select
          className={select}
          value={failureAction}
          onChange={(e) =>
            onChange({ ...value, failureAction: e.target.value as "rollback" | "pause" })
          }
        >
          <option value="rollback">{t("swarmCanvas.failRollback")}</option>
          <option value="pause">{t("swarmCanvas.failPause")}</option>
        </select>
      </Small>
      <Small label={t("swarmCanvas.parallelism")}>
        <Input
          type="number"
          min={1}
          value={parallelism}
          onChange={(e) => onChange({ ...value, parallelism: int(e.target.value, 1, 1) })}
        />
      </Small>
      <Small label={t("swarmCanvas.delay")}>
        <Input
          type="number"
          min={0}
          value={delaySeconds}
          onChange={(e) => onChange({ ...value, delaySeconds: int(e.target.value, 0, 0) })}
        />
      </Small>
      <Small label={t("swarmCanvas.monitor")}>
        <Input
          type="number"
          min={0}
          value={monitorSeconds}
          onChange={(e) => onChange({ ...value, monitorSeconds: int(e.target.value, 0, 0) })}
        />
      </Small>
    </div>
  );
}

/** A pick list of names that exist (secrets, configs). */
export function NameChecklist({
  names,
  selected,
  onChange,
  path,
  empty,
}: {
  names: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Where each one shows up inside the container. */
  path: (name: string) => string;
  empty: string;
}) {
  if (names.length === 0) return <p className="text-xs text-dim">{empty}</p>;
  return (
    <div className="flex flex-col gap-1">
      {names.map((n) => (
        <label key={n} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(n)}
            onChange={(e) =>
              onChange(e.target.checked ? [...selected, n] : selected.filter((x) => x !== n))
            }
          />
          <span className="font-mono">{n}</span>
          <span className="truncate text-xs text-dim">{path(n)}</span>
        </label>
      ))}
    </div>
  );
}

export function MountsEditor({
  value,
  onChange,
  defaultSource,
}: {
  value: SwarmMount[];
  onChange: (next: SwarmMount[]) => void;
  defaultSource: string;
}) {
  const { t } = useTranslation();
  const edit = (i: number, patch: Partial<SwarmMount>) =>
    onChange(value.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  return (
    <div className="flex flex-col gap-2">
      {value.map((m, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no id
        <div key={i} className="flex items-center gap-2">
          <Input
            className="min-w-0"
            aria-label={t("swarmCanvas.volumeName")}
            placeholder={t("swarmCanvas.volumeName")}
            value={m.source}
            onChange={(e) => edit(i, { source: e.target.value })}
          />
          <Input
            className="min-w-0"
            aria-label={t("swarmCanvas.mountPath")}
            placeholder="/data"
            value={m.target}
            onChange={(e) => edit(i, { target: e.target.value })}
          />
          <button
            type="button"
            aria-label={t("common.delete")}
            className="rounded p-1.5 text-dim hover:text-danger"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button
        className="w-full"
        onClick={() =>
          onChange([...value, { source: defaultSource, target: "/data", readOnly: false }])
        }
      >
        <Plus size={14} /> {t("swarmCanvas.addVolume")}
      </Button>
    </div>
  );
}

/** Published ports of a service that already exists: container port, host port, protocol. */
export function PortsEditor({
  value,
  onChange,
}: {
  value: SwarmPort[];
  onChange: (next: SwarmPort[]) => void;
}) {
  const { t } = useTranslation();
  const edit = (i: number, patch: Partial<SwarmPort>) =>
    onChange(value.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const port = (v: string): number => Math.min(65535, Math.max(1, Math.floor(Number(v)) || 1));
  return (
    <div className="flex flex-col gap-2">
      {value.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and have no id
        <div key={i} className="flex items-center gap-2">
          <Input
            className="min-w-0"
            type="number"
            aria-label={t("swarmCanvas.portPublished")}
            value={p.published ?? ""}
            placeholder={t("swarmCanvas.portPublished")}
            onChange={(e) =>
              edit(
                i,
                e.target.value === ""
                  ? { published: undefined }
                  : { published: port(e.target.value) },
              )
            }
          />
          <span className="text-dim">→</span>
          <Input
            className="min-w-0"
            type="number"
            aria-label={t("swarmCanvas.portTarget")}
            value={p.target}
            onChange={(e) => edit(i, { target: port(e.target.value) })}
          />
          <select
            aria-label="protocol"
            className="rounded-lg border border-line bg-bg0 px-2 py-1.5 text-sm"
            value={p.protocol}
            onChange={(e) => edit(i, { protocol: e.target.value as "tcp" | "udp" })}
          >
            <option value="tcp">tcp</option>
            <option value="udp">udp</option>
          </select>
          <button
            type="button"
            aria-label={t("common.delete")}
            className="rounded p-1.5 text-dim hover:text-danger"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button
        className="w-full"
        onClick={() => onChange([...value, { target: 80, protocol: "tcp" }])}
      >
        <Plus size={14} /> {t("swarmCanvas.addPort")}
      </Button>
    </div>
  );
}
