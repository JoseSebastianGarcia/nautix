import type { RegistryAuth, RegistryInfo } from "@nautix/contracts";

/** Saved registry logins; passwords are encrypted by the adapter. */
export abstract class RegistryStore {
  abstract list(): RegistryInfo[];
  /** Credentials for a (normalised) registry, ready to send to the engine. */
  abstract find(server: string): RegistryAuth | undefined;
  abstract save(server: string, username: string, password: string): void;
  abstract remove(server: string): boolean;
}
