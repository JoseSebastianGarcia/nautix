import type { Session } from "@nautix/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { keys } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { ThemedLogo } from "../../components/themed-logo.js";
import { Button, Field, Input } from "../../components/ui.js";

export function AuthPage({ session }: { session: Session }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const setup = session.setupRequired;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");

  const submit = useApiMutation(async () => {
    if (setup) await api.setup({ setupToken: token, username, password });
    await api.login({ username, password });
  }, [keys.session]);

  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <form
        className="flex w-[min(26rem,100%)] flex-col gap-4 rounded-2xl border border-line bg-bg1 p-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate(undefined, { onSuccess: () => void qc.invalidateQueries() });
        }}
      >
        <div className="flex justify-center">
          <ThemedLogo size={180} alt={t("app.name")} />
        </div>
        <h1 className="text-lg font-semibold">
          {setup ? t("auth.setupTitle") : t("auth.loginTitle")}
        </h1>
        {setup && <p className="text-sm text-dim">{t("auth.setupHint")}</p>}
        {setup && (
          <Field label={t("auth.setupToken")}>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
        )}
        <Field label={t("auth.username")}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            autoFocus
          />
        </Field>
        <Field label={t("auth.password")} hint={setup ? t("auth.passwordHint") : undefined}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={setup ? 10 : 1}
            autoComplete={setup ? "new-password" : "current-password"}
          />
        </Field>
        <Button variant="primary" type="submit" disabled={submit.isPending}>
          {setup ? t("auth.submitSetup") : t("auth.submitLogin")}
        </Button>
        <p className="text-xs text-amber">{t("auth.socketWarning")}</p>
      </form>
    </main>
  );
}
