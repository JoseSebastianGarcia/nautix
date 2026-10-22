import type { BindingStyle, SwarmBindingPlan } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";
import type { PlannedBind } from "./swarm-plan.js";

export interface BindTarget {
  consumer: { id: string; name: string };
  provider: { id: string; name: string };
}

/** Preview of wiring one service to another (passwords masked); confirming only adds it to the plan. */
export function SwarmBindDialog({
  target,
  onAdd,
  onClose,
}: {
  target: BindTarget | null;
  onAdd: (item: PlannedBind) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={t("swarmCanvas.bindTitle")}
      help="bindings"
    >
      {target && (
        <BindForm
          key={`${target.consumer.id}>${target.provider.id}`}
          target={target}
          onAdd={(item) => {
            onAdd(item);
            onClose();
          }}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function BindForm({
  target,
  onAdd,
  onClose,
}: {
  target: BindTarget;
  onAdd: (item: PlannedBind) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [style, setStyle] = useState<BindingStyle>("dotnet");
  const nameValid = name === "" || /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name);
  const preview = useQuery<SwarmBindingPlan>({
    queryKey: ["swarm-binding-plan", target.consumer.name, target.provider.name, name, style],
    queryFn: () =>
      api.swarmBindingPlan({
        consumer: target.consumer.name,
        provider: target.provider.name,
        style,
        ...(name ? { name } : {}),
      }),
    enabled: nameValid,
    retry: false,
  });
  const plan = preview.data;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!plan) return;
        onAdd({
          kind: "bind",
          key: `${target.consumer.name}>${target.provider.name}:${plan.name}`,
          consumer: target.consumer,
          provider: target.provider,
          name: plan.name,
          style,
          variables: plan.variables.map((v) => v.key),
          network: plan.network,
          joins: plan.joins,
        });
      }}
    >
      <p className="text-sm">
        <b className="font-mono">{target.consumer.name}</b> →{" "}
        <b className="font-mono">{target.provider.name}</b>
      </p>
      <p className="text-sm text-dim">{t("swarmCanvas.bindHint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("bindings.name")}>
          <Input
            value={name}
            placeholder={plan?.name ?? ""}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t("bindings.style")}>
          <select
            className="rounded-lg border border-line bg-bg0 px-3 py-2 text-sm"
            value={style}
            onChange={(e) => setStyle(e.target.value as BindingStyle)}
          >
            <option value="dotnet">{t("bindings.styles.dotnet")}</option>
            <option value="url">{t("bindings.styles.url")}</option>
          </select>
        </Field>
      </div>
      {!nameValid && <p className="text-xs text-danger">{t("swarmCanvas.bindNameInvalid")}</p>}
      {preview.isError && (
        <p role="alert" className="rounded-lg border border-danger p-2 text-sm text-danger">
          {preview.error instanceof Error ? preview.error.message : t("errors.generic")}
        </p>
      )}
      {plan && (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-3 text-sm">
          <p>
            <span className="text-dim">{t("swarmCanvas.bindDetected")}:</span> <b>{plan.kind}</b>
            {" · "}
            <span className="text-dim">{t("cluster.networks")}:</span>{" "}
            <b className="font-mono">{plan.network}</b>
            {plan.joins && <span className="text-amber"> ({t("swarmCanvas.bindJoins")})</span>}
          </p>
          {plan.variables.map((v) => (
            <code key={v.key} className="block break-all font-mono text-[11px] text-dim">
              {v.key}={v.preview}
            </code>
          ))}
          <p className="text-xs text-dim">{t("swarmCanvas.bindRolls")}</p>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={!plan || !nameValid}>
          {t("swarmCanvas.addToPlan")}
        </Button>
      </div>
    </form>
  );
}
