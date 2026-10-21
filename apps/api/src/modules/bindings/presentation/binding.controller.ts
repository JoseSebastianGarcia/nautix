import { type Binding, type BindingPlan, CreateBinding, ResourceName } from "@nautix/contracts";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";
import { parse } from "../../../shared/zod-body.js";
import { CreateBindingCommand } from "../application/commands/create-binding.command.js";
import { DeleteBindingCommand } from "../application/commands/delete-binding.command.js";
import { ReapplyBindingCommand } from "../application/commands/reapply-binding.command.js";
import { ListBindingsQuery } from "../application/queries/list-bindings.query.js";
import { PlanBindingQuery } from "../application/queries/plan-binding.query.js";

const Id = z.string().uuid();

/** Bindings: wire an app to a service it uses (network, name and connection settings in one step). */
@Controller("api/v1/bindings")
export class BindingController {
  constructor(
    @Inject(CommandBus) private readonly commands: CommandBus,
    @Inject(QueryBus) private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<Binding[]> {
    return this.queries.execute(new ListBindingsQuery());
  }

  /** What a binding would change, with passwords masked. A POST only because it carries a body. */
  @Post("plan")
  @HttpCode(200)
  plan(@Body() body: unknown): Promise<BindingPlan> {
    const b = parse(CreateBinding, body);
    return this.queries.execute(new PlanBindingQuery(b.consumer, b.provider, b.name, b.style));
  }

  @Post()
  create(@Body() body: unknown): Promise<Binding> {
    return this.commands.execute(new CreateBindingCommand(parse(CreateBinding, body)));
  }

  @Post(":id/apply")
  @HttpCode(200)
  reapply(@Param("id") id: string): Promise<Binding> {
    return this.commands.execute(new ReapplyBindingCommand(parse(Id, id)));
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string) {
    await this.commands.execute(new DeleteBindingCommand(parse(Id, id)));
  }
}
