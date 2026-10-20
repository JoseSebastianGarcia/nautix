import type { Layout } from "@nautix/contracts";

export abstract class LayoutRepository {
  abstract get(): Promise<Layout>;
  abstract save(layout: Layout): Promise<void>;
}
