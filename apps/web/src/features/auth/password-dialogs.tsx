import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, Dialog, Field, Input } from "../../components/ui.js";

const MIN = 10;

/** Your own password: asks for the current one; your other sessions are signed out. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({ current: "", next: "", again: "" });
  const change = useApiMutation(
    () => api.changePassword(f.current, f.next),
    [],
    () => t("auth.passwordChanged"),
  );
  const close = () => {
    setF({ current: "", next: "", again: "" });
    onClose();
  };
  const valid =
    f.current !== "" && f.next.length >= MIN && f.next === f.again && f.next !== f.current;
  return (
    <Dialog open={open} onClose={close} title={t("auth.changePassword")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) change.mutate(undefined, { onSuccess: close });
        }}
      >
        <Field label={t("auth.currentPassword")}>
          <Input
            type="password"
            autoComplete="current-password"
            value={f.current}
            onChange={(e) => setF({ ...f, current: e.target.value })}
            autoFocus
            required
          />
        </Field>
        <Field label={t("auth.newPassword")} hint={t("auth.passwordRule", { min: MIN })}>
          <Input
            type="password"
            autoComplete="new-password"
            value={f.next}
            onChange={(e) => setF({ ...f, next: e.target.value })}
            minLength={MIN}
            required
          />
        </Field>
        <Field label={t("auth.repeatPassword")}>
          <Input
            type="password"
            autoComplete="new-password"
            value={f.again}
            aria-invalid={f.again !== "" && f.again !== f.next}
            onChange={(e) => setF({ ...f, again: e.target.value })}
            required
          />
        </Field>
        <p className="text-xs text-dim">{t("auth.otherSessions")}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit" disabled={!valid || change.isPending}>
            {t("common.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Admin sets a new password for another user; that user is signed out everywhere. */
export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: { id: string; username: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const reset = useApiMutation(
    (id: string) => api.resetUserPassword(id, password),
    [],
    () => t("settings.passwordReset", { name: user?.username ?? "" }),
  );
  const close = () => {
    setPassword("");
    onClose();
  };
  return (
    <Dialog
      open={user !== null}
      onClose={close}
      title={t("settings.resetPasswordTitle", { name: user?.username ?? "" })}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (user && password.length >= MIN) reset.mutate(user.id, { onSuccess: close });
        }}
      >
        <Field label={t("auth.newPassword")} hint={t("auth.passwordRule", { min: MIN })}>
          <Input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN}
            required
            autoFocus
          />
        </Field>
        <p className="text-xs text-amber">{t("settings.resetPasswordWarning")}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button
            variant="primary"
            type="submit"
            disabled={password.length < MIN || reset.isPending}
          >
            {t("settings.resetPassword")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
