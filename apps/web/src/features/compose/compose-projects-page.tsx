import type { Container } from "@nautix/contracts";
import { FolderPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../app/api.js";
import { keys, useComposeProjects, useContainers } from "../../app/queries.js";
import { useApiMutation } from "../../app/use-api-mutation.js";
import { Button, ConfirmDialog, Dialog, Field, Input } from "../../components/ui.js";
import { PageHeader, Table, Td } from "../resources/table.js";

const BLANK = "# Nautix project\nservices:\n";
const NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const PROJECT_LABEL = "com.docker.compose.project";

export const projectContainers = (containers: Container[], project: string): Container[] =>
  containers.filter((c) => c.labels[PROJECT_LABEL] === project);

export function ComposeProjectsPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: projects = [] } = useComposeProjects();
  const { data: containers = [] } = useContainers();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [source, setSource] = useState<"blank" | "engine">("blank");
  const [target, setTarget] = useState<string | null>(null);

  const create = useApiMutation(async () => {
    const content = source === "engine" ? (await api.exportCompose(undefined, false)).yaml : BLANK;
    await api.saveComposeProject(name, content);
    return name;
  }, [keys.composeProjects]);
  const remove = useApiMutation((n: string) => api.deleteComposeProject(n), [keys.composeProjects]);
  const taken = projects.some((p) => p.name === name);
  const valid = NAME.test(name) && !taken;

  return (
    <div className="p-6">
      <PageHeader
        title={t("compose.title")}
        actions={
          <Button write variant="primary" onClick={() => setCreating(true)}>
            <FolderPlus size={14} /> {t("compose.newProject")}
          </Button>
        }
      />
      <Table
        head={[t("common.name"), t("common.status"), t("compose.updated"), t("common.actions")]}
        empty={projects.length === 0}
      >
        {projects.map((p) => {
          const mine = projectContainers(containers, p.name);
          const running = mine.filter((c) => c.state === "running").length;
          return (
            <tr key={p.name}>
              <Td mono>
                <Link className="text-accent hover:underline" to={`/compose/${p.name}`}>
                  {p.name}
                </Link>
              </Td>
              <Td>
                {mine.length === 0
                  ? t("compose.notDeployed")
                  : t("compose.runningCount", { running, total: mine.length })}
              </Td>
              <Td>{new Date(p.updatedAt).toLocaleString(i18n.language)}</Td>
              <Td>
                <Button
                  write
                  variant="danger"
                  aria-label={`${t("common.delete")} ${p.name}`}
                  onClick={() => setTarget(p.name)}
                >
                  <Trash2 size={14} />
                </Button>
              </Td>
            </tr>
          );
        })}
      </Table>
      <ConfirmDialog
        open={target !== null}
        title={t("compose.deleteTitle", { name: target ?? "" })}
        body={t("compose.deleteBody")}
        onConfirm={() => target && remove.mutate(target)}
        onClose={() => setTarget(null)}
      />
      <Dialog open={creating} onClose={() => setCreating(false)} title={t("compose.newProject")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(undefined, {
              onSuccess: (created) => {
                setCreating(false);
                setName("");
                navigate(`/compose/${created}`);
              },
            });
          }}
        >
          <Field
            label={t("common.name")}
            hint={taken ? t("errors.nameInUse") : t("compose.nameHint")}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              pattern="[a-z0-9][a-z0-9_\-]*"
            />
          </Field>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 text-dim">{t("compose.startFrom")}</legend>
            {(["blank", "engine"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="source"
                  checked={source === v}
                  onChange={() => setSource(v)}
                />
                {t(`compose.source.${v}`)}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreating(false)}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit" disabled={!valid || create.isPending}>
              {t("common.create")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
