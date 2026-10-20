/** Containers, images, volumes, networks and builds live under one "Resources" entry with its own tabs. */
export const RESOURCE_TABS = [
  { to: "/containers", key: "nav.containers" },
  { to: "/images", key: "nav.images" },
  { to: "/volumes", key: "nav.volumes" },
  { to: "/networks", key: "nav.networks" },
  { to: "/builds", key: "nav.builds" },
] as const;

const under = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`);

export const isResourcePath = (pathname: string): boolean =>
  RESOURCE_TABS.some((t) => under(pathname, t.to));

/** Whether a main-menu entry is the current one (the "Resources" entry covers its four sections). */
export const isActivePath = (itemTo: string, pathname: string): boolean => {
  if (itemTo === "/") return pathname === "/";
  if (itemTo === "/containers") return isResourcePath(pathname);
  return under(pathname, itemTo);
};
