import type { Binding } from "@nautix/contracts";

export abstract class BindingStore {
  abstract list(): Promise<Binding[]>;
  abstract get(id: string): Promise<Binding | null>;
  abstract save(binding: Binding): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
