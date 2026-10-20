import { TEMPLATES, type Template } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { CustomTemplateRepository } from "../ports/custom-template-repository.js";
import { ListCatalogQuery } from "./list-catalog.query.js";

/** Built-in templates first, then the ones saved on this server. */
@QueryHandler(ListCatalogQuery)
export class ListCatalogHandler implements IQueryHandler<ListCatalogQuery, Template[]> {
  constructor(
    @Inject(CustomTemplateRepository) private readonly custom: CustomTemplateRepository,
  ) {}

  async execute(): Promise<Template[]> {
    return [...TEMPLATES, ...(await this.custom.list())];
  }
}
