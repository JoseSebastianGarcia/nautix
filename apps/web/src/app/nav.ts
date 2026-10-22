/**
 * Containers, images, volumes, networks, builds, gateways, DNS and guards live under one "Resources" entry with its own
 * tabs. Swarm is in that list too, as a shortcut, and also has its own entry in the main menu; the page is the same.
 */
export const RESOURCE_TABS = [
  { to: "/containers", key: "nav.containers" },
  { to: "/images", key: "nav.images" },
  { to: "/volumes", key: "nav.volumes" },
  { to: "/networks", key: "nav.networks" },
  { to: "/builds", key: "nav.builds" },
  { to: "/gateway", key: "nav.gateway" },
  { to: "/dns", key: "nav.dns" },
  { to: "/guard", key: "nav.guard" },
  { to: "/swarm", key: "nav.swarm" },
] as const;

const under = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`);

/** The swarm page belongs to its own menu entry, so the Resources tabs and entry stay out of its way. */
export const isSwarmPath = (pathname: string): boolean => under(pathname, "/swarm");

export const isResourcePath = (pathname: string): boolean =>
  !isSwarmPath(pathname) && RESOURCE_TABS.some((t) => under(pathname, t.to));

/** Whether a main-menu entry is the current one (the "Resources" entry covers its four sections). */
export const isActivePath = (itemTo: string, pathname: string): boolean => {
  if (itemTo === "/") return pathname === "/" || under(pathname, "/zones");
  if (itemTo === "/containers") return isResourcePath(pathname);
  return under(pathname, itemTo);
};
