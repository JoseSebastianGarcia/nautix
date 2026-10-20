import type { Layout } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { LayoutRepository } from "../ports/layout-repository.js";
import { GetLayoutQuery } from "./get-layout.query.js";

@QueryHandler(GetLayoutQuery)
export class GetLayoutHandler implements IQueryHandler<GetLayoutQuery, Layout> {
  constructor(@Inject(LayoutRepository) private readonly layouts: LayoutRepository) {}

  execute(): Promise<Layout> {
    return this.layouts.get();
  }
}
