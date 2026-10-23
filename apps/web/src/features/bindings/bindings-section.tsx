import type { Binding, Container } from "@nautix/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog } from "../../components/ui.js";

/** The bindings a container takes part in: the services it uses and the apps that use it. */
export function BindingsSection({
  container,
  bindings,
}: {
  container: Container;
  bindings: Binding[];
}) {
  const { t } = useTranslation();
  const [removing, setRemoving] = useState<Binding | null>(null);
  const reapply = useApiMutation(
    (id: string) => api.reapplyBinding(id),
    [keys.containers, keys.bindings],
    () => t("bindings.reapplied"),
  );
  const remove = useApiMutation(
    (id: string) => api.deleteBinding(id),
    [keys.containers, keys.bindings],
    () => t("bindings.removed"),
  );
  const mine = bindings.filter(
    (b) => b.consumer === container.name || b.provider === container.name,
  );
  if (mine.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-xs uppercase tracking-wider text-dim">{t("bindings.section")}</h3>
      <ul className="flex flex-col gap-2">
        {mine.map((b) => {
          const uses = b.consumer === container.name;
          return (
            <li key={b.id} className="rounded-lg bg-bg2 px-2 py-2 text-xs">
              <p className="font-mono">
                {uses
                  ? t("bindings.uses", { service: b.provider, kind: b.kind })
                  : t("bindings.usedBy", { app: b.consumer, kind: b.kind })}
              </p>
              {uses && (
                <p className="mt-1 break-all font-mono text-dim">{b.variables.join(", ")}</p>
              )}
              <div className="mt-2 flex gap-2">
                {uses && (
                  <Button write onClick={() => reapply.mutate(b.id)} disabled={reapply.isPending}>
                    {t("bindings.reapply")}
                  </Button>
                )}
                <Button write variant="danger" onClick={() => setRemoving(b)}>
                  {t("bindings.remove")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        title={t("bindings.removeTitle")}
        confirmLabel={t("common.delete")}
        body={
          removing
            ? t("bindings.removeBody", {
                app: removing.consumer,
                variables: removing.variables.join(", "),
              })
            : ""
        }
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </section>
  );
}
