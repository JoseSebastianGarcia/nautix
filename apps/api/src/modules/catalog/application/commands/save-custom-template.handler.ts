import type { Template } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { ConflictError } from "../../../../shared/domain-error.js";
import { toTemplate } from "../../domain/custom-template.js";
import { CustomTemplateRepository } from "../ports/custom-template-repository.js";
import { SaveCustomTemplateCommand } from "./save-custom-template.command.js";

const MAX_TEMPLATES = 200;

@CommandHandler(SaveCustomTemplateCommand)
export class SaveCustomTemplateHandler
  implements ICommandHandler<SaveCustomTemplateCommand, Template>
{
  constructor(
    @Inject(CustomTemplateRepository) private readonly custom: CustomTemplateRepository,
  ) {}

  async execute({ input }: SaveCustomTemplateCommand): Promise<Template> {
    const template = toTemplate(input);
    const exists = (await this.custom.list()).some((t) => t.id === template.id);
    if (!exists && (await this.custom.count()) >= MAX_TEMPLATES) {
      throw new ConflictError("too many saved templates", "errors.tooManyTemplates");
    }
    await this.custom.save(template); // same name → updated in place
    return template;
  }
}
