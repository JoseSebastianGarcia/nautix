import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { CustomTemplateRepository } from "../ports/custom-template-repository.js";
import { DeleteCustomTemplateCommand } from "./delete-custom-template.command.js";

@CommandHandler(DeleteCustomTemplateCommand)
export class DeleteCustomTemplateHandler
  implements ICommandHandler<DeleteCustomTemplateCommand, void>
{
  constructor(
    @Inject(CustomTemplateRepository) private readonly custom: CustomTemplateRepository,
  ) {}

  execute({ id }: DeleteCustomTemplateCommand): Promise<void> {
    return this.custom.remove(id);
  }
}
