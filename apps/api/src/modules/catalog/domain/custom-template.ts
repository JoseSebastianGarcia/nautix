import type { CustomTemplateInput, Template } from "@nautix/contracts";

/** Stable id from the name, so saving the same name again updates the template. */
export const customTemplateId = (name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `custom-${slug || "template"}`;
};

const COLORS = ["#8b7cf6", "#38d5ff", "#ffb020", "#4ade80", "#ff4d6a", "#f472b6"];

/** Deterministic tint so a template keeps its color between sessions. */
const colorFor = (id: string): string => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length] as string;
};

export const toTemplate = (input: CustomTemplateInput): Template => {
  const id = customTemplateId(input.name);
  return {
    id,
    name: input.name,
    category: "custom",
    image: input.image,
    description: input.description || input.image,
    icon: "docker",
    color: colorFor(id),
    ports: input.ports.map((p) => ({
      containerPort: p.containerPort,
      label: p.label || String(p.containerPort),
      ...(p.protocol ? { protocol: p.protocol } : {}),
      ...(p.hostPort ? { hostPort: p.hostPort } : {}),
    })),
    ...(Object.keys(input.env).length ? { env: input.env } : {}),
    ...(input.volumes.length ? { volumes: input.volumes } : {}),
    ...(input.mounts.length ? { mounts: input.mounts } : {}),
    ...(input.command?.length ? { command: input.command } : {}),
    custom: true,
  };
};
