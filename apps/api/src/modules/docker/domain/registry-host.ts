/** Canonical name for a registry: no scheme, no path, Docker Hub's aliases folded into `docker.io`. */
export const normaliseServer = (server: string): string => {
  const host = server
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0] as string;
  return ["index.docker.io", "registry-1.docker.io", "registry.hub.docker.com"].includes(host)
    ? "docker.io"
    : host;
};

/** Registry an image reference lives in (`nginx` and `user/app` are Docker Hub). */
export const registryOf = (reference: string): string => {
  const first = reference.split("/")[0] as string;
  const isHost = reference.includes("/") && (/[.:]/.test(first) || first === "localhost");
  return isHost ? normaliseServer(first) : "docker.io";
};

/** What the engine expects in `serveraddress`. */
export const serverAddress = (server: string): string =>
  server === "docker.io" ? "https://index.docker.io/v1/" : server;
