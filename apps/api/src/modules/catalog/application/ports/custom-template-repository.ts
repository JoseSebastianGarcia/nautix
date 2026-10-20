import type { Template } from "@nautix/contracts";

export abstract class CustomTemplateRepository {
  abstract list(): Promise<Template[]>;
  /** Insert or replace by id. */
  abstract save(template: Template): Promise<void>;
  abstract remove(id: string): Promise<void>;
  abstract count(): Promise<number>;
}
