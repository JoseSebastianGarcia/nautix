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
  DiskUsage,
  EngineInfo,
  FsChange,
  GatewayApplyResult,
  GatewayRoute,
  Image,
  ImageHistoryEntry,
  ImageSearchResult,
  Layout,
  Network,
  PruneKind,
  PrunePreview,
  PruneResult,
  RegistryAuth,
  RegistryInfo,
  SaveRegistry,
  Session,
  Template,
  TlsCustomCertificate,
  TlsStatus,
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

export interface AuditRow {
  id: number;
  at: number;
  actor: string;
  kind: string;
  action: string;
  status: number;
  detail: string;
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
  registries: () => request<RegistryInfo[]>("GET", "/registries"),
  saveRegistry: (b: SaveRegistry) => request<RegistryInfo>("PUT", "/registries", b),
  removeRegistry: (server: string) =>
    request<void>("DELETE", `/registries/${encodeURIComponent(server)}`),
  audit: (before?: number) =>
    request<AuditRow[]>("GET", `/settings/audit?limit=100${before ? `&before=${before}` : ""}`),
  restoreBackup: async (file: File) => {
    const res = await fetch("/api/v1/settings/restore", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-nautix-csrf": "1", "content-type": "application/gzip" },
      body: file,
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { code?: string; hintKey?: string };
      throw new ApiError(res.status, problem.code ?? "internal", problem.hintKey);
    }
  },
  tls: () => request<TlsStatus>("GET", "/settings/tls"),
  setTlsHosts: (hosts: string[]) => request<TlsStatus>("PUT", "/settings/tls/hosts", { hosts }),
  setTlsCustom: (b: TlsCustomCertificate) => request<TlsStatus>("PUT", "/settings/tls/custom", b),
  removeTlsCustom: () => request<TlsStatus>("DELETE", "/settings/tls/custom"),

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

  gatewayRoutes: (name: string) => request<GatewayRoute[]>("GET", `/gateways/${name}/routes`),
  saveGatewayRoutes: (name: string, routes: GatewayRoute[]) =>
    request<void>("PUT", `/gateways/${name}/routes`, { routes }),
  applyGateway: (name: string) => request<GatewayApplyResult>("POST", `/gateways/${name}/apply`),

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

  imageHistory: (ref: string) =>
    request<ImageHistoryEntry[]>("GET", `/images/history?ref=${encodeURIComponent(ref)}`),
  searchImages: (term: string) =>
    request<ImageSearchResult[]>("GET", `/images/search?term=${encodeURIComponent(term)}`),
  tagImage: (reference: string, repository: string, tag: string) =>
    request<void>("POST", "/images/tag", { reference, repository, tag }),
  pushImage: (reference: string, auth?: RegistryAuth) =>
    request<{ output: string }>("POST", "/images/push", { reference, ...(auth ? { auth } : {}) }),
  testRegistry: (auth: RegistryAuth) =>
    request<{ status: string }>("POST", "/registries/test", auth),
  /** Streams a tar file as the request body (docker load / docker import). */
  uploadImageTar: async (path: "/images/load" | `/images/import?${string}`, file: File) => {
    const res = await fetch(`/api/v1${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-nautix-csrf": "1", "content-type": "application/x-tar" },
      body: file,
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { code?: string; hintKey?: string };
      throw new ApiError(res.status, problem.code ?? "internal", problem.hintKey);
    }
    return (await res.json()) as { output: string };
  },
  systemInfo: () => request<Record<string, unknown>>("GET", "/system/info"),
  systemVersion: () => request<Record<string, unknown>>("GET", "/system/version"),
  diskUsage: () => request<DiskUsage>("GET", "/system/df"),
  prunePreview: (kind: PruneKind, all: boolean) =>
    request<PrunePreview>("GET", `/system/prune/preview?kind=${kind}&all=${all}`),
  prune: (kind: PruneKind, all: boolean) =>
    request<PruneResult>("POST", "/system/prune", { kind, all }),

  images: () => request<Image[]>("GET", "/images"),
  pullImage: (reference: string) => request<void>("POST", "/images/pull", { reference }),
  removeImage: (id: string, force: boolean) =>
    request<void>("DELETE", `/images/${encodeURIComponent(id)}?force=${force}`),

  volumes: () => request<Volume[]>("GET", "/volumes"),
  createVolume: (name: string) => request<void>("POST", "/volumes", { name }),
  removeVolume: (name: string) => request<void>("DELETE", `/volumes/${encodeURIComponent(name)}`),
};
