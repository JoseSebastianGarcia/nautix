import type { ContainerAction } from "@nautix/contracts";

/** "Show command": the docker CLI equivalent of each UI action. Pure, so it is unit-tested. */
export const cli = {
  containerAction: (action: ContainerAction, name: string): string => `docker ${action} ${name}`,
  removeContainer: (name: string, force: boolean): string =>
    `docker rm${force ? " -f" : ""} ${name}`,
  logs: (name: string): string => `docker logs --tail 300 -t ${name}`,
  createNetwork: (
    name: string,
    internal: boolean,
    subnet?: string,
    overlay?: { encrypted: boolean; attachable: boolean },
  ): string =>
    `docker network create${overlay ? " -d overlay" : ""}${overlay?.encrypted ? " --opt encrypted" : ""}${overlay?.attachable ? " --attachable" : ""}${internal ? " --internal" : ""}${subnet ? ` --subnet ${subnet}` : ""} ${name}`,
  removeNetwork: (name: string): string => `docker network rm ${name}`,
  connect: (network: string, container: string): string =>
    `docker network connect ${network} ${container}`,
  disconnect: (network: string, container: string): string =>
    `docker network disconnect ${network} ${container}`,
  pull: (reference: string): string => `docker pull ${reference}`,
  removeImage: (name: string): string => `docker rmi ${name}`,
  createVolume: (name: string): string => `docker volume create ${name}`,
  removeVolume: (name: string): string => `docker volume rm ${name}`,
  run: (opts: {
    name: string;
    image: string;
    network?: string;
    restart?: string;
    ports: {
      host?: number;
      container: number;
      pub: boolean;
      /** Bind to this host address instead of loopback / all interfaces. */
      ip?: string;
      protocol?: "tcp" | "udp";
    }[];
    /** Folder mappings as `/host:/container[:ro]`. */
    mounts?: string[];
  }): string =>
    [
      "docker run -d",
      `--name ${opts.name}`,
      opts.network ? `--network ${opts.network}` : "",
      opts.restart && opts.restart !== "no" ? `--restart ${opts.restart}` : "",
      ...opts.ports.map(
        (p) =>
          `-p ${p.ip ?? (p.pub ? "0.0.0.0" : "127.0.0.1")}:${p.host ?? ""}:${p.container}${p.protocol === "udp" ? "/udp" : ""}`,
      ),
      ...(opts.mounts ?? []).map((m) => `-v ${m}`),
      opts.image,
    ]
      .filter(Boolean)
      .join(" "),
};
