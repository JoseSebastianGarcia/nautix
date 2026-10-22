import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";

/** Start a swarm on this engine or join an existing one: the two ways of getting a cluster to manage. */
export function SwarmConnect({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const [addr, setAddr] = useState("");
  const [join, setJoin] = useState({ remoteAddr: "", token: "" });
  const init = useApiMutation(
    () => api.swarmInit(addr.trim() || undefined),
    [keys.swarm],
    () => t("swarm.initialized"),
  );
  const joinMutation = useApiMutation(
    () => api.swarmJoin(join),
    [keys.swarm],
    () => t("swarm.joined"),
  );
  const done = { onSuccess: () => onDone?.() };
  return (
    <>
      <p className="text-sm text-dim">{t("swarm.intro")}</p>
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-bg1 p-4">
        <h2 className="font-semibold">{t("swarm.initTitle")}</h2>
        <Field label={t("swarm.advertiseAddr")} hint={t("swarm.advertiseHint")}>
          <Input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="192.168.1.10"
          />
        </Field>
        <Button
          write
          variant="primary"
          disabled={init.isPending}
          onClick={() => init.mutate(undefined, done)}
        >
          {t("swarm.init")}
        </Button>
      </section>
      <section className="flex flex-col gap-3 rounded-xl border border-line bg-bg1 p-4">
        <h2 className="font-semibold">{t("swarm.joinTitle")}</h2>
        <Field label={t("swarm.remoteAddr")}>
          <Input
            value={join.remoteAddr}
            onChange={(e) => setJoin({ ...join, remoteAddr: e.target.value })}
            placeholder="192.168.1.10:2377"
          />
        </Field>
        <Field label={t("swarm.token")}>
          <Input
            type="password"
            autoComplete="off"
            value={join.token}
            onChange={(e) => setJoin({ ...join, token: e.target.value })}
          />
        </Field>
        <Button
          write
          disabled={!join.remoteAddr || !join.token || joinMutation.isPending}
          onClick={() => joinMutation.mutate(undefined, done)}
        >
          {t("swarm.join")}
        </Button>
      </section>
    </>
  );
}

export function SwarmConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={t("swarm.connectTitle")} help="swarm">
      {open && <SwarmConnect onDone={onClose} />}
    </Dialog>
  );
}
