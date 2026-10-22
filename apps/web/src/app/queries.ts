import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export const keys = {
  session: ["session"],
  engine: ["engine"],
  containers: ["containers"],
  networks: ["networks"],
  images: ["images"],
  volumes: ["volumes"],
  layout: ["layout"],
  catalog: ["catalog"],
  composeProjects: ["compose-projects"],
  bindings: ["bindings"],
  zones: ["zones"],
  swarm: ["swarm"],
  cluster: ["cluster"],
} as const;

/** Live updates come from the SSE stream; polling is only a slow safety net. */
const LIVE = 30_000;

export const useSession = () =>
  useQuery({ queryKey: keys.session, queryFn: api.session, retry: false });
export const useEngine = () =>
  useQuery({ queryKey: keys.engine, queryFn: api.engine, refetchInterval: 30_000 });
export const useCatalog = () =>
  useQuery({ queryKey: keys.catalog, queryFn: api.catalog, staleTime: Infinity });
export const useContainers = () =>
  useQuery({ queryKey: keys.containers, queryFn: api.containers, refetchInterval: LIVE });
/** Whether this engine is in a swarm, and as what. Cheap and slow-moving: it decides which views exist. */
export const useSwarmStatus = () =>
  useQuery({ queryKey: keys.swarm, queryFn: api.swarm, refetchInterval: 15_000 });
/** The whole cluster as the manager sees it; only polled while a view that shows it is open. */
export const useCluster = (enabled: boolean) =>
  useQuery({
    queryKey: keys.cluster,
    queryFn: api.swarmCluster,
    enabled,
    refetchInterval: 5_000,
  });
export const useNetworks = () =>
  useQuery({ queryKey: keys.networks, queryFn: api.networks, refetchInterval: LIVE });
export const useImages = () =>
  useQuery({ queryKey: keys.images, queryFn: api.images, refetchInterval: 30_000 });
export const useVolumes = () =>
  useQuery({ queryKey: keys.volumes, queryFn: api.volumes, refetchInterval: 30_000 });

/** UI hint only: the server enforces roles. Viewers get read-only controls. */
export const useIsAdmin = (): boolean => useSession().data?.role === "admin";

export const useLayout = () =>
  useQuery({ queryKey: keys.layout, queryFn: api.layout, staleTime: 60_000 });

export const useComposeProjects = () =>
  useQuery({ queryKey: keys.composeProjects, queryFn: api.composeProjects });
