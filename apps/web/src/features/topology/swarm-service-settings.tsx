import type {
  SwarmHealthcheck,
  SwarmMount,
  SwarmPort,
  SwarmResources,
  SwarmUpdatePolicy,
} from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { Undo2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { Button, Input } from "../../components/ui.js";
import type { ClusterService } from "./cluster-model.js";
import {
  type PlanItem,
  planConfigs,
  planEnvForget,
  planEnvSet,
  planEnvUnset,
  planHealthcheck,
  planMounts,
  planPolicy,
  planPorts,
  planResources,
  planSecrets,
  type UpdateFields,
  upsertUpdate,
} from "./swarm-plan.js";
import {
  HealthcheckFields,
  MountsEditor,
  NameChecklist,
  PolicyFields,
  PortsEditor,
  ResourcesFields,
} from "./swarm-settings-fields.js";

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function Section({
  title,
  pending,
  children,
}: {
  title: string;
  /** This setting has a change waiting in the plan. */
  pending: boolean;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border border-line p-2 text-sm">
      <summary className="cursor-pointer select-none">
        {title}
        {pending && (
          <span className="ml-2 rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">
            ●
          </span>
        )}
      </summary>
      <div className="mt-2 flex flex-col gap-2">{children}</div>
    </details>
  );
}

/**
 * The settings of a service that exists, each one editable on its own: ports, volumes, secrets, configs,
 * environment, health check, limits and the update policy. Every "Set" only adds a change to the plan.
 */
export function ServiceSettings({
  svc,
  plan,
  secretNames,
  configNames,
  onPlan,
}: {
  svc: ClusterService;
  plan: PlanItem[];
  secretNames: string[];
  configNames: string[];
  onPlan: (next: PlanItem[]) => void;
}) {
  const { t } = useTranslation();
  const s = svc.service;
  const handle = { id: s.id, name: s.name };
  const pending: UpdateFields =
    plan.find((p) => p.kind === "update" && p.serviceId === s.id)?.kind === "update"
      ? (plan.find((p) => p.kind === "update" && p.serviceId === s.id) as { changes: UpdateFields })
          .changes
      : {};
  const apply = (fn: (c: UpdateFields) => UpdateFields) => onPlan(upsertUpdate(plan, handle, fn));

  const [ports, setPorts] = useState<SwarmPort[]>(s.ports);
  const [mounts, setMounts] = useState<SwarmMount[]>(s.mounts);
  const [secrets, setSecrets] = useState<string[]>(s.secrets);
  const [configs, setConfigs] = useState<string[]>(s.configs);
  const [health, setHealth] = useState<SwarmHealthcheck | null>(s.healthcheck);
  const [resources, setResources] = useState<SwarmResources>(s.resources);
  const [policy, setPolicy] = useState<SwarmUpdatePolicy>(s.policy);
  const [envName, setEnvName] = useState("");
  const [envValue, setEnvValue] = useState("");
  const env = useQuery({ queryKey: ["swarm-env", s.id], queryFn: () => api.swarmServiceEnv(s.id) });
  const envNames = env.data?.names ?? [];
  const setKeys = Object.keys(pending.env?.set ?? {});
  const unsetKeys = pending.env?.unset ?? [];

  const set = (label: string, disabled: boolean, onClick: () => void) => (
    <Button disabled={disabled} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <>
      <h3 className="font-mono text-xs uppercase tracking-wider text-dim">
        {t("swarmCanvas.settings")}
      </h3>

      <Section title={t("swarmCanvas.portsTitle")} pending={!!pending.ports}>
        <p className="text-xs text-dim">{t("swarmCanvas.portsEditHint")}</p>
        <PortsEditor value={ports} onChange={setPorts} />
        {set(t("swarmCanvas.set"), same(ports, s.ports) && !pending.ports, () =>
          apply(planPorts(s.ports, ports)),
        )}
      </Section>

      <Section title={t("swarmCanvas.volumes")} pending={!!pending.mounts}>
        <MountsEditor value={mounts} onChange={setMounts} defaultSource={`${s.name}-data`} />
        <p className="text-xs text-dim">{t("swarmCanvas.volumesEditHint")}</p>
        {set(t("swarmCanvas.set"), same(mounts, s.mounts) && !pending.mounts, () =>
          apply(planMounts(s.mounts, mounts)),
        )}
      </Section>

      <Section
        title={t("swarmCanvas.secretsConfigs")}
        pending={!!pending.secrets || !!pending.configs}
      >
        <h4 className="text-xs text-dim">{t("swarmCanvas.secrets")}</h4>
        <NameChecklist
          names={[...new Set([...secretNames, ...s.secrets])]}
          selected={secrets}
          onChange={setSecrets}
          path={(n) => `/run/secrets/${n}`}
          empty={t("swarmCanvas.noSecrets")}
        />
        <h4 className="text-xs text-dim">{t("swarmCanvas.configs")}</h4>
        <NameChecklist
          names={[...new Set([...configNames, ...s.configs])]}
          selected={configs}
          onChange={setConfigs}
          path={(n) => `/${n}`}
          empty={t("swarmCanvas.noConfigs")}
        />
        {set(
          t("swarmCanvas.set"),
          same([...secrets].sort(), [...s.secrets].sort()) &&
            same([...configs].sort(), [...s.configs].sort()) &&
            !pending.secrets &&
            !pending.configs,
          () => {
            apply((c) => planSecrets(s.secrets, secrets)(planConfigs(s.configs, configs)(c)));
          },
        )}
      </Section>

      <Section title={t("swarmCanvas.envTitle")} pending={!!pending.env}>
        <p className="text-xs text-dim">{t("swarmCanvas.envEditHint")}</p>
        <div className="flex flex-wrap gap-1">
          {envNames.map((n) => {
            const removing = unsetKeys.includes(n);
            return (
              <span
                key={n}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[11px] ${removing ? "border-danger text-danger line-through" : "border-line"}`}
              >
                {n}
                <button
                  type="button"
                  aria-label={
                    removing
                      ? t("swarmCanvas.keepVar", { name: n })
                      : t("swarmCanvas.removeVar", { name: n })
                  }
                  className="text-dim hover:text-fg"
                  onClick={() => apply(removing ? planEnvForget(n) : planEnvUnset(n))}
                >
                  {removing ? <Undo2 size={11} /> : <X size={11} />}
                </button>
              </span>
            );
          })}
          {setKeys.map((n) => (
            <span
              key={`set-${n}`}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-accent px-2 py-0.5 font-mono text-[11px] text-accent"
            >
              {n} ({t("swarmCanvas.new")})
              <button
                type="button"
                aria-label={t("swarmCanvas.keepVar", { name: n })}
                onClick={() => apply(planEnvForget(n))}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            className="min-w-0"
            aria-label={t("swarmCanvas.envName")}
            placeholder="NAME"
            value={envName}
            onChange={(e) => setEnvName(e.target.value)}
          />
          <Input
            className="min-w-0"
            type="password"
            autoComplete="off"
            aria-label={t("swarmCanvas.envValue")}
            placeholder={t("swarmCanvas.envValue")}
            value={envValue}
            onChange={(e) => setEnvValue(e.target.value)}
          />
        </div>
        {set(t("swarmCanvas.set"), !/^[A-Za-z_][A-Za-z0-9_]*$/.test(envName), () => {
          apply(planEnvSet(envName, envValue));
          setEnvName("");
          setEnvValue("");
        })}
      </Section>

      <Section title={t("swarmCanvas.healthTitle")} pending={!!pending.healthcheck}>
        <HealthcheckFields value={health} onChange={setHealth} />
        {set(
          t("swarmCanvas.set"),
          (same(health, s.healthcheck) && !pending.healthcheck) ||
            (health !== null && health.command.trim() === ""),
          () => apply(planHealthcheck(s.healthcheck, health)),
        )}
      </Section>

      <Section title={t("swarmCanvas.resourcesTitle")} pending={!!pending.resources}>
        <ResourcesFields value={resources} onChange={setResources} />
        {set(t("swarmCanvas.set"), same(resources, s.resources) && !pending.resources, () =>
          apply(planResources(s.resources, resources)),
        )}
      </Section>

      <Section title={t("swarmCanvas.policyTitle")} pending={!!pending.policy}>
        <p className="text-xs text-dim">{t("swarmCanvas.policyEditHint")}</p>
        <PolicyFields value={policy} onChange={setPolicy} />
        {set(t("swarmCanvas.set"), same(policy, s.policy) && !pending.policy, () =>
          apply(planPolicy(s.policy, policy as Required<SwarmUpdatePolicy>)),
        )}
      </Section>
    </>
  );
}
