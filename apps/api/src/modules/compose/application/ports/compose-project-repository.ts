import type { ComposeProject, ComposeProjectSummary } from "@nautix/contracts";

export abstract class ComposeProjectRepository {
  abstract list(): Promise<ComposeProjectSummary[]>;
  abstract get(name: string): Promise<ComposeProject | null>;
  abstract save(name: string, content: string, at: number): Promise<void>;
  abstract remove(name: string): Promise<void>;
}
