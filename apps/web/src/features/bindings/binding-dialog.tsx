import {
  BINDING_STYLES,
  type BindingStyle,
  type Container,
  type CreateBindingInput,
} from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { ApplyFailure } from "../../components/apply-failure.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";

export interface BindTarget {
  consumer: Container;
  provider: Container;
}

const NAME = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

/** What dragging an app onto a service does, shown before anything changes. */
export function BindingDialog({
  target,
  onClose,
}: {
  target: BindTarget | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      title={
        target
          ? t("bindings.title", { app: target.consumer.name, service: target.provider.name })
          : ""
      }
    >
      {target && <BindingForm target={target} onClose={onClose} />}
    </Dialog>
  );
}

function BindingForm({ target, onClose }: { target: BindTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(() => {
    const clean = target.provider.name.replace(/[^A-Za-z0-9]/g, "");
    return /^[A-Za-z]/.test(clean) ? clean : `Svc${clean}`;
  });
  const [style, setStyle] = useState<BindingStyle>("dotnet");
  const input: CreateBindingInput = {
    consumer: target.consumer.name,
    provider: target.provider.name,
    name,
    style,
  };
  const valid = NAME.test(name);
  const plan = useQuery({
    queryKey: ["binding-plan", input],
    queryFn: () => api.planBinding(input),
    enabled: valid,
    retry: false,
  });
  const create = useApiMutation(
    () => api.createBinding(input),
    [keys.containers, keys.bindings],
    () => t("bindings.done"),
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && plan.data) create.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("bindings.name")} hint={t("bindings.nameHint")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} />
        </Field>
        <Field label={t("bindings.style")}>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as BindingStyle)}
            className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
          >
            {BINDING_STYLES.map((s) => (
              <option key={s} value={s}>
                {t(`bindings.styles.${s}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {plan.isError && <p className="text-sm text-danger">{t("bindings.cannot")}</p>}
      {plan.data && (
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-bg0 p-3 text-sm">
          <p>
            {t("bindings.kindIs", { kind: t(`bindings.kinds.${plan.data.kind}`) })}
            {" · "}
            {plan.data.joins
              ? t("bindings.joins", { app: target.consumer.name, network: plan.data.network })
              : t("bindings.shares", { network: plan.data.network })}
          </p>
          <ul className="flex flex-col gap-1">
            {plan.data.variables.map((v) => (
              <li key={v.key} className="font-mono text-xs break-all">
                <span className="text-accent">{v.key}</span>={v.preview}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-amber">{t("bindings.secretNote")}</p>
      <p className="text-xs text-dim">{t("bindings.recreate")}</p>
      <ApplyFailure error={create.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          write
          variant="primary"
          type="submit"
          disabled={!valid || !plan.data || create.isPending}
        >
          {create.isPending ? t("env.applying") : t("bindings.bind")}
        </Button>
      </div>
    </form>
  );
}
