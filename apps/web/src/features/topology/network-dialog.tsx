import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { cli } from "../../app/cli.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog, Field, Input, ShowCommand } from "../../components/ui.js";

export function NetworkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t("topology.newNetwork")}>
      {open && <NetworkForm onClose={onClose} />}
    </Dialog>
  );
}

function NetworkForm({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [internal, setInternal] = useState(true);
  const [subnet, setSubnet] = useState("");

  const create = useApiMutation(
    () => api.createNetwork({ name, internal, ...(subnet ? { subnet } : {}) }),
    [keys.networks],
    () => t("toast.networkCreated", { name }),
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(undefined, { onSuccess: onClose });
      }}
    >
      <Field label={t("topology.networkName")}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]*"
          autoFocus
        />
      </Field>
      <Field label={t("topology.subnet")}>
        <Input
          value={subnet}
          onChange={(e) => setSubnet(e.target.value)}
          placeholder="172.40.0.0/24"
          pattern="\d{1,3}(\.\d{1,3}){3}/\d{1,2}"
        />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={internal}
          onChange={(e) => setInternal(e.target.checked)}
        />
        <span>
          {t("topology.internal")}
          <span className="block text-xs text-dim">{t("topology.internalHint")}</span>
        </span>
      </label>
      <ShowCommand command={cli.createNetwork(name || "<name>", internal, subnet || undefined)} />
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="primary" type="submit" disabled={create.isPending}>
          {t("common.create")}
        </Button>
      </div>
    </form>
  );
}
