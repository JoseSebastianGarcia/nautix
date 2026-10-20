import type {
  Container,
  ContainerAction,
  CreateContainer,
  CreateNetwork,
  EngineInfo,
  Image,
  Network,
  Session,
  Template,
  Volume,
} from "@nautix/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly hintKey: string | undefined,
  ) {
    super(code);
  }
}

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "x-nautix-csrf": "1",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { code?: string; hintKey?: string };
    throw new ApiError(res.status, problem.code ?? "internal", problem.hintKey);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
};

/** Typed client for the Nautix API. Components never call fetch directly. */
export const api = {
  session: () => request<Session>("GET", "/auth/session"),
  setup: (b: { setupToken: string; username: string; password: string }) =>
    request<void>("POST", "/auth/setup", b),
  login: (b: { username: string; password: string }) => request<void>("POST", "/auth/login", b),
  logout: () => request<void>("POST", "/auth/logout"),

  engine: () => request<EngineInfo>("GET", "/engine"),
  catalog: () => request<Template[]>("GET", "/catalog"),

  containers: () => request<Container[]>("GET", "/containers"),
  createContainer: (
    b: Omit<CreateContainer, "env" | "ports" | "labels" | "volumes"> & Partial<CreateContainer>,
  ) => request<{ id: string }>("POST", "/containers", b),
  containerAction: (id: string, action: ContainerAction, confirm?: string) =>
    request<void>(
      "POST",
      `/containers/${id}/${action}${confirm ? `?confirm=${encodeURIComponent(confirm)}` : ""}`,
    ),
  removeContainer: (id: string, force: boolean, confirm?: string) =>
    request<void>(
      "DELETE",
      `/containers/${id}?force=${force}${confirm ? `&confirm=${encodeURIComponent(confirm)}` : ""}`,
    ),
  logs: (id: string) => request<{ logs: string }>("GET", `/containers/${id}/logs?tail=300`),

  exportCompose: (networkId: string | undefined, includeEnv: boolean) =>
    request<{ yaml: string }>(
      "GET",
      `/export/compose?includeEnv=${includeEnv}${networkId ? `&network=${encodeURIComponent(networkId)}` : ""}`,
    ),
  networks: () => request<Network[]>("GET", "/networks"),
  createNetwork: (b: Pick<CreateNetwork, "name" | "internal" | "subnet">) =>
    request<{ id: string }>("POST", "/networks", b),
  removeNetwork: (id: string) => request<void>("DELETE", `/networks/${id}`),
  connect: (networkId: string, containerId: string) =>
    request<void>("POST", `/networks/${networkId}/connect`, { containerId }),
  disconnect: (networkId: string, containerId: string, confirm?: string) =>
    request<void>("POST", `/networks/${networkId}/disconnect`, {
      containerId,
      ...(confirm ? { confirm } : {}),
    }),

  images: () => request<Image[]>("GET", "/images"),
  pullImage: (reference: string) => request<void>("POST", "/images/pull", { reference }),
  removeImage: (id: string, force: boolean) =>
    request<void>("DELETE", `/images/${encodeURIComponent(id)}?force=${force}`),

  volumes: () => request<Volume[]>("GET", "/volumes"),
  createVolume: (name: string) => request<void>("POST", "/volumes", { name }),
  removeVolume: (name: string) => request<void>("DELETE", `/volumes/${encodeURIComponent(name)}`),
};
