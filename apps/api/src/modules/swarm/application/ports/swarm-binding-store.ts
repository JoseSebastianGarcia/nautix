import type { SwarmBinding } from "@nautix/contracts";

export abstract class SwarmBindingStore {
  abstract list(): Promise<SwarmBinding[]>;
  abstract get(id: string): Promise<SwarmBinding | null>;
  abstract save(binding: SwarmBinding): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
