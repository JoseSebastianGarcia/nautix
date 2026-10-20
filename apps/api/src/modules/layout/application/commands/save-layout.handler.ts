import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { LayoutRepository } from "../ports/layout-repository.js";
import { SaveLayoutCommand } from "./save-layout.command.js";

@CommandHandler(SaveLayoutCommand)
export class SaveLayoutHandler implements ICommandHandler<SaveLayoutCommand, void> {
  constructor(@Inject(LayoutRepository) private readonly layouts: LayoutRepository) {}

  execute({ layout }: SaveLayoutCommand): Promise<void> {
    return this.layouts.save(layout);
  }
}
