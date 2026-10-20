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
} as const;

/** Polling keeps the UI close to the engine state until the WS events gateway lands. */
const LIVE = 3000;

export const useSession = () =>
  useQuery({ queryKey: keys.session, queryFn: api.session, retry: false });
export const useEngine = () =>
  useQuery({ queryKey: keys.engine, queryFn: api.engine, refetchInterval: 10_000 });
export const useCatalog = () =>
  useQuery({ queryKey: keys.catalog, queryFn: api.catalog, staleTime: Infinity });
export const useContainers = () =>
  useQuery({ queryKey: keys.containers, queryFn: api.containers, refetchInterval: LIVE });
export const useNetworks = () =>
  useQuery({ queryKey: keys.networks, queryFn: api.networks, refetchInterval: LIVE });
export const useImages = () =>
  useQuery({ queryKey: keys.images, queryFn: api.images, refetchInterval: 10_000 });
export const useVolumes = () =>
  useQuery({ queryKey: keys.volumes, queryFn: api.volumes, refetchInterval: 10_000 });
