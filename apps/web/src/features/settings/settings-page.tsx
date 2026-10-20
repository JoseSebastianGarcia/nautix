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
import { PageHeader, Table, Td } from "../resources/table.js";

const ROLES: Role[] = ["admin", "viewer"];

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-10 p-6">
      <UsersSection />
      <TokensSection />
    </div>
  );
}

function UsersSection() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: api.users });
  const [adding, setAdding] = useState(false);
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
