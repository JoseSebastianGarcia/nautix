import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, Input } from "../../components/ui.js";

export function ComposeNetworkDialog({
  open,
  taken,
  onCreate,
  onClose,
}: {
  open: boolean;
  taken: string[];
  onCreate: (name: string, internal: boolean, subnet: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [internal, setInternal] = useState(true);
  const [subnet, setSubnet] = useState("");
  const duplicate = taken.includes(name);
  return (
    <Dialog open={open} onClose={onClose} title={t("topology.newNetwork")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (duplicate) return;
          onCreate(name, internal, subnet);
          setName("");
          setSubnet("");
          onClose();
        }}
      >
        <Field
          label={t("topology.networkName")}
          {...(duplicate ? { hint: t("errors.nameInUse") } : {})}
        >
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
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit" disabled={duplicate}>
            {t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function CustomImageDialog({
  open,
  onAdd,
  onClose,
}: {
  open: boolean;
  onAdd: (image: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [image, setImage] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={t("common.image")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(image.trim());
          setImage("");
          onClose();
        }}
      >
        <Field label={t("common.image")}>
          <Input
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="nginx:1.27-alpine"
            required
            autoFocus
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit">
            {t("compose.addService")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
