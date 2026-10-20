import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export const keys = {
  session: ["session"],
  engine: ["engine"],
  catalog: ["catalog"],
  containers: ["containers"],
  networks: ["networks"],
  images: ["images"],
  volumes: ["volumes"],
  layout: ["layout"],
  composeProjects: ["compose-projects"],
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
