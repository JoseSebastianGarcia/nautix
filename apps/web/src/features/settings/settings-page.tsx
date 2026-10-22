import type { Role } from "@nautix/contracts";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../app/api.js";
import { useSession } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Select } from "../../components/select.js";
import { useToasts } from "../../components/toast-store.js";
import { Button, ConfirmDialog, Dialog, Field, Input } from "../../components/ui.js";
import { PRESET_ACCENTS, resolveAccent } from "../../theme/accent.js";
import { resolveTheme } from "../../theme/resolve-theme.js";
import { useTheme } from "../../theme/theme-store.js";
import { AuditTable } from "../audit/audit-table.js";
import { useDebounced } from "../audit/use-debounced.js";
import { ResetPasswordDialog } from "../auth/password-dialogs.js";
import { PageHeader, Table, Td } from "../resources/table.js";

const ROLES: Role[] = ["admin", "viewer"];

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-10 p-6">
      <AppearanceSection />
      <UsersSection />
      <TokensSection />
      <RegistriesSection />
      <TlsSection />
      <BackupSection />
      <AuditSection />
    </div>
  );
}

function AppearanceSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveTheme(theme.choice, dark);
  const result = resolveAccent(theme.accent, resolved);
  return (
    <section>
      <PageHeader title={t("appearance.title")} />
      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-bg1 p-5">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("appearance.accent")}</h3>
          <p className="text-xs text-dim">{t("appearance.accentHint")}</p>
          <div className="flex flex-wrap items-center gap-3">
            {PRESET_ACCENTS.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={hex}
                aria-pressed={hex === theme.accent}
                onClick={() => theme.setAccent(hex)}
                style={{ background: hex }}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-bg1 ${hex === theme.accent ? "ring-2 ring-fg" : ""}`}
              />
            ))}
            <label className="flex items-center gap-2 text-xs text-dim">
              {t("appearance.custom")}
              <input
                type="color"
                value={result.accent}
                onChange={(e) => theme.setAccent(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
              />
            </label>
            <Button onClick={() => theme.setAccent(PRESET_ACCENTS[0])}>
              {t("appearance.reset")}
            </Button>
          </div>
          <p className="text-xs text-dim">
            <span className="font-mono text-accent">{result.accent.toUpperCase()}</span>
            {" · "}
            {t("appearance.contrast", { ratio: result.ratio.toFixed(1) })}
            {result.hueMoved && ` · ${t("appearance.hueMoved")}`}
            {result.adjusted && ` · ${t("appearance.adjusted")}`}
          </p>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={theme.reduceTransparency}
            onChange={(e) => theme.setReduceTransparency(e.target.checked)}
          />
          <span>
            <span className="font-medium">{t("appearance.reduceTransparency")}</span>
            <span className="block text-xs text-dim">{t("appearance.reduceTransparencyHint")}</span>
          </span>
        </label>
      </div>
    </section>
  );
}

function UsersSection() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<{ id: string; username: string } | null>(null);
  const [target, setTarget] = useState<{ id: string; username: string } | null>(null);
  const remove = useApiMutation((id: string) => api.deleteUser(id), [["users"]]);
  const roleOptions = ROLES.map((r) => ({ value: r, text: t(`settings.${r}`) }));

  return (
    <section>
      <PageHeader
        title={t("settings.users")}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <UserPlus size={14} /> {t("settings.addUser")}
          </Button>
        }
      />
      <Table
        head={[t("auth.username"), t("settings.role"), t("common.actions")]}
        empty={users.length === 0}
      >
        {users.map((u) => (
          <tr key={u.id}>
            <Td mono>
              {u.username}{" "}
              {u.username === session?.username && (
                <span className="text-dim">({t("settings.you")})</span>
              )}
            </Td>
            <Td>{t(`settings.${u.role}`)}</Td>
            <Td>
              <Button
                aria-label={`${t("settings.resetPassword")} ${u.username}`}
                title={t("settings.resetPassword")}
                onClick={() => setResetting(u)}
              >
                <KeyRound size={14} />
              </Button>{" "}
              <Button
                variant="danger"
                disabled={u.username === session?.username}
                aria-label={`${t("common.delete")} ${u.username}`}
                onClick={() => setTarget(u)}
              >
                <Trash2 size={14} />
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
      <p className="mt-2 text-xs text-dim">{t("settings.roleHint")}</p>
      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />
      <AddUserDialog open={adding} roleOptions={roleOptions} onClose={() => setAdding(false)} />
      <ConfirmDialog
        open={target !== null}
        title={t("settings.deleteUserTitle", { name: target?.username ?? "" })}
        body={t("settings.deleteUserBody")}
        onConfirm={() => target && remove.mutate(target.id)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function AddUserDialog({
  open,
  roleOptions,
  onClose,
}: {
  open: boolean;
  roleOptions: { value: string; text: string }[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const create = useApiMutation(() => api.createUser({ username, password, role }), [["users"]]);
  return (
    <Dialog open={open} onClose={onClose} title={t("settings.addUser")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(undefined, {
            onSuccess: () => {
              setUsername("");
              setPassword("");
              onClose();
            },
          });
        }}
      >
        <Field label={t("auth.username")}>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            pattern="[a-zA-Z0-9_.\-]{3,32}"
            autoFocus
            autoComplete="off"
          />
        </Field>
        <Field label={t("auth.password")} hint={t("auth.passwordHint")}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
          />
        </Field>
        <Field label={t("settings.role")}>
          <Select
            label={t("settings.role")}
            value={role}
            options={roleOptions}
            onChange={(v) => setRole(v as Role)}
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" type="submit" disabled={create.isPending}>
            {t("common.create")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function TokensSection() {
  const { t, i18n } = useTranslation();
  const push = useToasts((s) => s.push);
  const { data: tokens = [] } = useQuery({ queryKey: ["tokens"], queryFn: api.tokens });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("viewer");
  const [created, setCreated] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const roleOptions = ROLES.map((r) => ({ value: r, text: t(`settings.${r}`) }));
  const create = useApiMutation(() => api.createToken({ name, role }), [["tokens"]]);
  const revoke = useApiMutation((id: string) => api.revokeToken(id), [["tokens"]]);

  return (
    <section>
      <PageHeader
        title={t("settings.tokens")}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t("settings.addToken")}
          </Button>
        }
      />
      <Table
        head={[
          t("common.name"),
          t("settings.role"),
          t("common.created"),
          t("settings.lastUsed"),
          t("common.actions"),
        ]}
        empty={tokens.length === 0}
      >
        {tokens.map((k) => (
          <tr key={k.id}>
            <Td>
              <span className="flex items-center gap-2">
                <KeyRound size={14} className="text-dim" /> {k.name}
              </span>
            </Td>
            <Td>{t(`settings.${k.role}`)}</Td>
            <Td>{new Date(k.createdAt).toLocaleDateString(i18n.language)}</Td>
            <Td>
              {k.lastUsedAt
                ? new Date(k.lastUsedAt).toLocaleString(i18n.language)
                : t("settings.never")}
            </Td>
            <Td>
              <Button
                variant="danger"
                aria-label={`${t("settings.revoke")} ${k.name}`}
                onClick={() => setTarget(k)}
              >
                <Trash2 size={14} />
              </Button>
            </Td>
          </tr>
        ))}
      </Table>

      <Dialog
        open={adding}
        onClose={() => (setAdding(false), setCreated(null))}
        title={t("settings.addToken")}
      >
        {created ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-amber">{t("settings.tokenShownOnce")}</p>
            <code className="break-all rounded-lg border border-line bg-bg0 p-3 font-mono text-xs">
              {created}
            </code>
            <p className="text-xs text-dim">{t("settings.tokenUsage")}</p>
            <div className="flex justify-end gap-2">
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(created);
                  push("ok", t("common.copied"));
                }}
              >
                {t("common.copy")}
              </Button>
              <Button
                variant="primary"
                onClick={() => (setAdding(false), setCreated(null), setName(""))}
              >
                {t("common.close")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(undefined, { onSuccess: (r) => setCreated(r.token) });
            }}
          >
            <Field label={t("settings.tokenName")}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={64}
                autoFocus
              />
            </Field>
            <Field label={t("settings.role")}>
              <Select
                label={t("settings.role")}
                value={role}
                options={roleOptions}
                onChange={(v) => setRole(v as Role)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
              <Button variant="primary" type="submit" disabled={create.isPending}>
                {t("common.create")}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
      <ConfirmDialog
        open={target !== null}
        title={t("settings.revokeTitle", { name: target?.name ?? "" })}
        body={t("settings.revokeBody")}
        onConfirm={() => target && revoke.mutate(target.id)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function TlsSection() {
  const { t } = useTranslation();
  const { data: tls } = useQuery({ queryKey: ["tls"], queryFn: api.tls });
  const [hosts, setHosts] = useState<string | null>(null);
  const [custom, setCustom] = useState({ open: false, cert: "", key: "" });
  const saveHosts = useApiMutation((list: string[]) => api.setTlsHosts(list), [["tls"]]);
  const saveCustom = useApiMutation(() => api.setTlsCustom(custom), [["tls"]]);
  const removeCustom = useApiMutation(() => api.removeTlsCustom(), [["tls"]]);
  if (!tls) return null;

  const extraHosts = tls.hosts.filter((h) => !["localhost", "127.0.0.1", "::1"].includes(h));
  const hostsText = hosts ?? extraHosts.join(", ");
  const managed = tls.mode === "local-ca" || tls.mode === "custom";

  return (
    <section>
      <PageHeader title={t("settings.tls")} />
      <div className="flex flex-col gap-4 rounded-xl border border-line bg-bg1 p-4 text-sm">
        <p>
          <span className="text-dim">{t("settings.tlsMode")}: </span>
          {t(`settings.tlsModes.${tls.mode}`)}
          {tls.validTo && (
            <span className="text-dim">
              {" "}
              · {t("settings.tlsExpires", { date: new Date(tls.validTo).toLocaleDateString() })}
            </span>
          )}
        </p>
        {tls.mode === "off" && <p className="text-dim">{t("settings.tlsOff")}</p>}
        {tls.mode === "external" && <p className="text-dim">{t("settings.tlsExternal")}</p>}
        {managed && (
          <>
            <Field label={t("settings.tlsHosts")}>
              <Input
                value={hostsText}
                placeholder="nautix.lan, 192.168.1.10"
                onChange={(e) => setHosts(e.target.value)}
              />
            </Field>
            <p className="text-xs text-dim">{t("settings.tlsHostsHint")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={hosts === null || tls.mode === "custom" || saveHosts.isPending}
                onClick={() =>
                  saveHosts.mutate(
                    (hosts ?? "")
                      .split(",")
                      .map((h) => h.trim())
                      .filter((h) => h !== ""),
                    { onSuccess: () => setHosts(null) },
                  )
                }
              >
                {t("settings.tlsReissue")}
              </Button>
              {tls.ca && (
                <a href="/api/v1/settings/tls/ca.pem" download>
                  <Button>{t("settings.tlsDownloadCa")}</Button>
                </a>
              )}
              <Button onClick={() => setCustom({ open: true, cert: "", key: "" })}>
                {t("settings.tlsUseOwn")}
              </Button>
              {tls.mode === "custom" && (
                <Button variant="danger" onClick={() => removeCustom.mutate(undefined)}>
                  {t("settings.tlsBackToLocal")}
                </Button>
              )}
            </div>
            {tls.ca && (
              <details className="text-xs text-dim">
                <summary className="cursor-pointer text-text">
                  {t("settings.tlsTrustTitle")}
                </summary>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                  <li>{t("settings.tlsTrustWindows")}</li>
                  <li>{t("settings.tlsTrustMac")}</li>
                  <li>{t("settings.tlsTrustLinux")}</li>
                  <li>{t("settings.tlsTrustFirefox")}</li>
                </ul>
                <p className="mt-2 font-mono">SHA-256: {tls.ca.fingerprint}</p>
              </details>
            )}
          </>
        )}
      </div>
      <Dialog
        open={custom.open}
        onClose={() => setCustom({ open: false, cert: "", key: "" })}
        title={t("settings.tlsUseOwn")}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveCustom.mutate(undefined, {
              onSuccess: () => setCustom({ open: false, cert: "", key: "" }),
            });
          }}
        >
          <Field label={t("settings.tlsCert")}>
            <textarea
              className="h-32 w-full rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
              value={custom.cert}
              onChange={(e) => setCustom({ ...custom, cert: e.target.value })}
              placeholder="-----BEGIN CERTIFICATE-----"
              required
            />
          </Field>
          <Field label={t("settings.tlsKey")}>
            <textarea
              className="h-32 w-full rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
              value={custom.key}
              onChange={(e) => setCustom({ ...custom, key: e.target.value })}
              placeholder="-----BEGIN PRIVATE KEY-----"
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCustom({ open: false, cert: "", key: "" })}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" type="submit" disabled={saveCustom.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}

function RegistriesSection() {
  const { t } = useTranslation();
  const { data: registries = [] } = useQuery({ queryKey: ["registries"], queryFn: api.registries });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ server: "docker.io", username: "", password: "" });
  const [target, setTarget] = useState<string | null>(null);
  const save = useApiMutation(
    () => api.saveRegistry(form),
    [["registries"]],
    () => t("settings.registrySaved", { server: form.server }),
  );
  const remove = useApiMutation((server: string) => api.removeRegistry(server), [["registries"]]);

  return (
    <section>
      <PageHeader
        title={t("settings.registries")}
        actions={
          <Button variant="primary" onClick={() => setAdding(true)}>
            <Plus size={14} /> {t("settings.addRegistry")}
          </Button>
        }
      />
      <p className="mb-3 text-xs text-dim">{t("settings.registriesHint")}</p>
      <Table
        head={[t("settings.registryServer"), t("auth.username"), t("common.actions")]}
        empty={registries.length === 0}
      >
        {registries.map((r) => (
          <tr key={r.server}>
            <Td mono>{r.server}</Td>
            <Td mono>{r.username}</Td>
            <Td>
              <Button
                variant="danger"
                aria-label={`${t("settings.registryRemove")} ${r.server}`}
                onClick={() => setTarget(r.server)}
              >
                <Trash2 size={14} />
              </Button>
            </Td>
          </tr>
        ))}
      </Table>
      <Dialog open={adding} onClose={() => setAdding(false)} title={t("settings.addRegistry")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(undefined, {
              onSuccess: () => {
                setAdding(false);
                setForm({ server: "docker.io", username: "", password: "" });
              },
            });
          }}
        >
          <Field label={t("settings.registryServer")} hint={t("images.registryHint")}>
            <Input
              value={form.server}
              onChange={(e) => setForm({ ...form, server: e.target.value })}
              placeholder="docker.io"
              required
            />
          </Field>
          <Field label={t("auth.username")}>
            <Input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="off"
              required
            />
          </Field>
          <Field label={t("settings.registryPassword")}>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              required
            />
          </Field>
          <p className="text-xs text-dim">{t("settings.registryStored")}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdding(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" disabled={save.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={target !== null}
        title={t("settings.registryRemoveTitle", { server: target ?? "" })}
        body={t("settings.registryRemoveBody")}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function BackupSection() {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const restore = useApiMutation(
    (f: File) => api.restoreBackup(f),
    [],
    () => t("settings.restoreStarted"),
  );
  return (
    <section>
      <PageHeader title={t("settings.backup")} />
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-bg1 p-4 text-sm">
        <p className="text-dim">{t("settings.backupHint")}</p>
        <p className="text-xs text-amber">{t("settings.backupWarning")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <a href="/api/v1/settings/backup" download>
            <Button>{t("settings.backupDownload")}</Button>
          </a>
          <label className="flex items-center gap-2 text-xs text-dim">
            {t("settings.restoreFile")}
            <input
              type="file"
              accept=".nbk,application/gzip"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            variant="danger"
            disabled={!file || restore.isPending}
            onClick={() => setConfirm(true)}
          >
            {t("settings.restore")}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t("settings.restoreTitle")}
        body={t("settings.restoreBody")}
        onConfirm={() => file && restore.mutate(file)}
        onClose={() => setConfirm(false)}
      />
    </section>
  );
}

function AuditSection() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const {
    data: rows = [],
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["audit", q],
    queryFn: () => api.audit(undefined, q || undefined),
  });
  return (
    <section>
      <PageHeader
        title={t("settings.audit")}
        actions={
          <>
            <Input
              type="search"
              aria-label={t("settings.auditSearch")}
              placeholder={t("settings.auditSearch")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
            <Button onClick={() => void refetch()} disabled={isFetching}>
              {t("common.refresh")}
            </Button>
          </>
        }
      />
      <p className="mb-2 text-xs text-dim">{t("settings.auditNote")}</p>
      <AuditTable rows={rows} />
    </section>
  );
}
