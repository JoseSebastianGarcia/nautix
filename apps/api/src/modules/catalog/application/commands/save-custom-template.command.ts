import type { CustomTemplateInput } from "@nautix/contracts";

export class SaveCustomTemplateCommand {
  constructor(public readonly input: CustomTemplateInput) {}
}
