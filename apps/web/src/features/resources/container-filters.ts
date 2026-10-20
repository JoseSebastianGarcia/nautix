import type { Container } from "@nautix/contracts";

export interface ContainerFilter {
  text: string;
  status: "all" | "running" | "stopped";
  project: string;
  /** `key` or `key=value`. */
  label: string;
}

export const NO_FILTER: ContainerFilter = { text: "", status: "all", project: "", label: "" };
const PROJECT_LABEL = "com.docker.compose.project";

/** `docker ps` filters: name/image text, running or stopped, compose project and label. */
export const filterContainers = (list: Container[], f: ContainerFilter): Container[] => {
  const text = f.text.trim().toLowerCase();
  const [labelKey, ...rest] = f.label.trim().split("=");
  const labelValue = rest.join("=");
  return list.filter((c) => {
    if (text && !`${c.name} ${c.image} ${c.id}`.toLowerCase().includes(text)) return false;
    if (f.status === "running" && c.state !== "running") return false;
    if (f.status === "stopped" && c.state === "running") return false;
    if (f.project && c.labels[PROJECT_LABEL] !== f.project) return false;
    if (labelKey) {
      const value = c.labels[labelKey];
      if (value === undefined) return false;
      if (rest.length > 0 && value !== labelValue) return false;
    }
    return true;
  });
};

export const composeProjects = (list: Container[]): string[] =>
  [...new Set(list.map((c) => c.labels[PROJECT_LABEL]).filter((p): p is string => !!p))].sort();
