import {
  assemblyOf,
  defaultParams,
  type GeneratedProject,
  type Params,
  RECIPES,
  type Recipe,
  type RecipeField,
  visibleFields,
} from "@nautix/dockerfile";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, Input } from "../../components/ui.js";

interface Props {
  open: boolean;
  onClose: () => void;
  onUse: (project: GeneratedProject) => void;
}

const GROUPS = ["dotnet", "other"] as const;

/** Pick what you are building, answer a few questions, get a Dockerfile (and its helper files). */
export function RecipeWizard({ open, onClose, onUse }: Props) {
  const { t } = useTranslation();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [params, setParams] = useState<Params>({});

  const project = useMemo(() => (recipe ? recipe.generate(params) : null), [recipe, params]);
  const close = () => {
    setRecipe(null);
    onClose();
  };
  const choose = (r: Recipe) => {
    setRecipe(r);
    setParams(defaultParams(r));
  };
  const set = (id: string, value: string | number | boolean) =>
    setParams((p) => ({ ...p, [id]: value }));

  const control = (f: RecipeField) => {
    const label = t(`builds.wizard.fields.${f.id}`);
    const value = params[f.id] ?? f.default;
    const hintKey = `builds.wizard.hints.${f.id}`;
    const hint = t(hintKey, { defaultValue: "" });
    if (f.kind === "boolean")
      return (
        <label key={f.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => set(f.id, e.target.checked)}
          />
          <span>
            {label}
            {hint && <span className="block text-xs text-dim">{hint}</span>}
          </span>
        </label>
      );
    return (
      <Field key={f.id} label={label} {...(hint ? { hint } : {})}>
        {f.kind === "select" ? (
          <select
            value={String(value)}
            onChange={(e) => set(f.id, e.target.value)}
            className="rounded-lg border border-line bg-bg0 px-2 py-2 text-sm text-fg"
          >
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {t(`builds.wizard.options.${f.id}.${o}`, { defaultValue: o })}
              </option>
            ))}
          </select>
        ) : f.kind === "lines" ? (
          <textarea
            value={String(value)}
            onChange={(e) => set(f.id, e.target.value)}
            className="h-16 rounded-lg border border-line bg-bg0 p-2 font-mono text-xs"
          />
        ) : (
          <Input
            type={f.kind === "number" ? "number" : "text"}
            value={String(value)}
            placeholder={
              f.id === "assembly" && recipe ? assemblyOf(String(params.project ?? "")) : ""
            }
            onChange={(e) =>
              set(f.id, f.kind === "number" ? Number(e.target.value) : e.target.value)
            }
          />
        )}
      </Field>
    );
  };

  return (
    <Dialog open={open} onClose={close} title={t("builds.wizard.title")}>
      {!recipe ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-dim">{t("builds.wizard.intro")}</p>
          {GROUPS.map((g) => (
            <section key={g} className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-wider text-dim">
                {t(`builds.wizard.groups.${g}`)}
              </h3>
              {RECIPES.filter((r) => r.group === g).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => choose(r)}
                  className="rounded-xl border border-line p-3 text-left hover:border-accent"
                >
                  <span className="block text-sm font-medium">
                    {t(`builds.wizard.recipes.${r.id}.name`)}
                  </span>
                  <span className="block text-xs text-dim">
                    {t(`builds.wizard.recipes.${r.id}.desc`)}
                  </span>
                </button>
              ))}
            </section>
          ))}
          <div className="flex justify-end">
            <Button onClick={close}>{t("common.cancel")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setRecipe(null)}
            className="flex w-fit items-center gap-1 text-xs text-dim hover:text-fg"
          >
            <ArrowLeft size={12} /> {t(`builds.wizard.recipes.${recipe.id}.name`)}
          </button>
          {visibleFields(recipe, params).map(control)}
          {project && (
            <>
              <section aria-label={t("builds.wizard.preview")}>
                <pre className="max-h-56 overflow-auto rounded-lg border border-line bg-bg0 p-3 font-mono text-xs">
                  {project.dockerfile}
                </pre>
              </section>
              <ul className="list-disc pl-5 text-xs text-dim">
                {project.notes.map((n) => (
                  <li key={n.key}>{t(`builds.wizard.notes.${n.key}`, n.params)}</li>
                ))}
              </ul>
              <p className="text-xs text-dim">
                {t("builds.wizard.files", { files: project.files.map((f) => f.path).join(", ") })}
              </p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={close}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (project) onUse(project);
                close();
              }}
            >
              {t("builds.wizard.use")}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
