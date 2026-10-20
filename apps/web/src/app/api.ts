import type {
  ApiTokenInfo,
  CommitContainer,
  ComposeAction,
  ComposeProject,
  ComposeProjectSummary,
  ComposeRunResult,
  Container,
  ContainerAction,
  ContainerStats,
  ContainerTop,
  CreateContainer,
  CreateNetwork,
  CreateToken,
  CreateTunnel,
  CreateUser,
  CustomTemplateInput,
  EngineInfo,
  FsChange,
  Image,
  Layout,
  Network,
  Session,
  Template,
  UpdateContainer,
  UserInfo,
  Volume,
  WaitResult,
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

  users: () => request<UserInfo[]>("GET", "/settings/users"),
  createUser: (b: CreateUser) => request<{ id: string }>("POST", "/settings/users", b),
  deleteUser: (id: string) => request<void>("DELETE", `/settings/users/${id}`),
  tokens: () => request<ApiTokenInfo[]>("GET", "/settings/tokens"),
  createToken: (b: CreateToken) =>
    request<{ id: string; token: string }>("POST", "/settings/tokens", b),
  revokeToken: (id: string) => request<void>("DELETE", `/settings/tokens/${id}`),

  layout: () => request<Layout>("GET", "/layout"),
  saveLayout: (layout: Layout) => request<void>("PUT", "/layout", layout),

  composeProjects: () => request<ComposeProjectSummary[]>("GET", "/compose/projects"),
  composeProject: (name: string) => request<ComposeProject>("GET", `/compose/projects/${name}`),
  saveComposeProject: (name: string, content: string) =>
    request<void>("PUT", `/compose/projects/${name}`, { content }),
  deleteComposeProject: (name: string) => request<void>("DELETE", `/compose/projects/${name}`),
  runCompose: (
    name: string,
    action: ComposeAction,
    opts: { acknowledgeRisks?: boolean; removeVolumes?: boolean } = {},
  ) => request<ComposeRunResult>("POST", `/compose/projects/${name}/${action}`, opts),

  engine: () => request<EngineInfo>("GET", "/engine"),
  catalog: () => request<Template[]>("GET", "/catalog"),
  saveCustomTemplate: (b: CustomTemplateInput) => request<Template>("POST", "/catalog/custom", b),
  deleteCustomTemplate: (id: string) => request<void>("DELETE", `/catalog/custom/${id}`),

  containers: () => request<Container[]>("GET", "/containers"),
  createContainer: (
    b: Omit<CreateContainer, "env" | "ports" | "labels" | "volumes"> & Partial<CreateContainer>,
  ) => request<{ id: string }>("POST", "/containers", b),
  containerAction: (
    id: string,
    action: ContainerAction,
    opts: { signal?: string; timeout?: number } = {},
  ) => {
    const q = new URLSearchParams();
    if (opts.signal) q.set("signal", opts.signal);
    if (opts.timeout !== undefined) q.set("timeout", String(opts.timeout));
    const qs = q.toString();
    return request<void>("POST", `/containers/${id}/${action}${qs ? `?${qs}` : ""}`);
  },
  inspect: (kind: "containers" | "networks" | "volumes", id: string) =>
    request<unknown>("GET", `/${kind}/${encodeURIComponent(id)}/inspect`),
  inspectImage: (ref: string) =>
    request<unknown>("GET", `/images/inspect?ref=${encodeURIComponent(ref)}`),
  stats: (id: string) => request<ContainerStats>("GET", `/containers/${id}/stats`),
  top: (id: string) => request<ContainerTop>("GET", `/containers/${id}/top`),
  diff: (id: string) => request<FsChange[]>("GET", `/containers/${id}/diff`),
  renameContainer: (id: string, name: string) =>
    request<void>("POST", `/containers/${id}/rename`, { name }),
  updateContainer: (id: string, b: UpdateContainer) =>
    request<void>("POST", `/containers/${id}/update`, b),
  waitContainer: (id: string, timeout: number) =>
    request<WaitResult>("POST", `/containers/${id}/wait?timeout=${timeout}`),
  commitContainer: (id: string, b: Omit<CommitContainer, "pause"> & { pause?: boolean }) =>
    request<{ id: string }>("POST", `/containers/${id}/commit`, b),
  /** Uploads a tar into a directory of the container (streamed, not buffered in JSON). */
  uploadArchive: async (id: string, path: string, file: File) => {
    const res = await fetch(`/api/v1/containers/${id}/archive?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "x-nautix-csrf": "1", "content-type": "application/x-tar" },
      body: file,
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { code?: string; hintKey?: string };
      throw new ApiError(res.status, problem.code ?? "internal", problem.hintKey);
    }
  },
  removeContainer: (id: string, force: boolean) =>
    request<void>("DELETE", `/containers/${id}?force=${force}`),
  logs: (id: string, tail = 300) =>
    request<{ logs: string }>("GET", `/containers/${id}/logs?tail=${tail}`),

  exportCompose: (networkId: string | undefined, includeEnv: boolean) =>
    request<{ yaml: string }>(
      "GET",
      `/export/compose?includeEnv=${includeEnv}${networkId ? `&network=${encodeURIComponent(networkId)}` : ""}`,
    ),
  createTunnel: (b: CreateTunnel) => request<{ id: string }>("POST", "/tunnels", b),
  networks: () => request<Network[]>("GET", "/networks"),
  createNetwork: (b: Pick<CreateNetwork, "name" | "internal" | "subnet">) =>
    request<{ id: string }>("POST", "/networks", b),
  removeNetwork: (id: string) => request<void>("DELETE", `/networks/${id}`),
  connect: (networkId: string, containerId: string) =>
    request<void>("POST", `/networks/${networkId}/connect`, { containerId }),
  disconnect: (networkId: string, containerId: string) =>
    request<void>("POST", `/networks/${networkId}/disconnect`, { containerId }),

  images: () => request<Image[]>("GET", "/images"),
  pullImage: (reference: string) => request<void>("POST", "/images/pull", { reference }),
  removeImage: (id: string, force: boolean) =>
    request<void>("DELETE", `/images/${encodeURIComponent(id)}?force=${force}`),

  volumes: () => request<Volume[]>("GET", "/volumes"),
  createVolume: (name: string) => request<void>("POST", "/volumes", { name }),
  removeVolume: (name: string) => request<void>("DELETE", `/volumes/${encodeURIComponent(name)}`),
};
