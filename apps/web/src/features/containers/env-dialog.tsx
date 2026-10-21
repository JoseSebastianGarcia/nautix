import type { Container } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { ApplyFailure } from "../../components/apply-failure.js";
import { EnvEditor } from "../../components/fields.js";
import { Button, Dialog } from "../../components/ui.js";

interface Inspected {
  Config?: { Env?: string[] | null };
}

const toEntries = (env: string[] | null | undefined): [string, string][] =>
  (env ?? []).map((line) => {
    const i = line.indexOf("=");
    return i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 1)];
  });

/** Edits a container's environment. Docker cannot do it in place, so it is recreated behind the health gate. */
export function EnvDialog({
  container,
  onClose,
}: {
  container: Container | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={container !== null}
      onClose={onClose}
      title={t("env.title", { name: container?.name ?? "" })}
    >
      {container && <EnvForm container={container} onClose={onClose} />}
    </Dialog>
  );
}

function EnvForm({ container, onClose }: { container: Container; onClose: () => void }) {
  const { t } = useTranslation();
  const inspected = useQuery({
    queryKey: ["inspect-env", container.id],
    queryFn: () => api.inspect("containers", container.id) as Promise<Inspected>,
  });
  const initial = toEntries(inspected.data?.Config?.Env);
  const [draft, setDraft] = useState<[string, string][] | null>(null);
  const entries = draft ?? initial;

  const original = new Map(initial);
  const next = new Map(entries);
  const set = Object.fromEntries(entries.filter(([k, v]) => original.get(k) !== v));
  const unset = initial.map(([k]) => k).filter((k) => !next.has(k));
  const changed = Object.keys(set).length + unset.length;

  const save = useApiMutation(
    () => api.setEnv(container.id, { set, unset }),
    [keys.containers, ["inspect-env", container.id]],
    () => t("env.done"),
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed > 0) save.mutate(undefined, { onSuccess: onClose });
      }}
    >
      {inspected.isLoading ? (
        <p className="text-sm text-dim">{t("common.loading")}</p>
      ) : (
        <EnvEditor label={t("env.variables")} entries={entries} onChange={setDraft} />
      )}
      <p className="text-xs text-dim">{t("env.recreate")}</p>
      <ApplyFailure error={save.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button write variant="primary" type="submit" disabled={changed === 0 || save.isPending}>
          {save.isPending ? t("env.applying") : t("env.apply", { count: changed })}
        </Button>
      </div>
    </form>
  );
}
