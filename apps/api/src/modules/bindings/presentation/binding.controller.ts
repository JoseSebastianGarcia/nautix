import { type Binding, type BindingPlan, CreateBinding, ResourceName } from "@nautix/contracts";
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Request } from "express";
import { z } from "zod";
import { bindingDetail, setAuditNote } from "../../../shared/audit-note.js";
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
  plan(@Req() req: Request, @Body() body: unknown): Promise<BindingPlan> {
    setAuditNote(req, { detail: "", skip: true });
    const b = parse(CreateBinding, body);
    return this.queries.execute(new PlanBindingQuery(b.consumer, b.provider, b.name, b.style));
  }

  @Post()
  create(@Req() req: Request, @Body() body: unknown): Promise<Binding> {
    const b = parse(CreateBinding, body);
    setAuditNote(req, {
      detail: bindingDetail("create", {
        consumer: b.consumer,
        provider: b.provider,
        name: b.name ?? b.provider,
        style: b.style,
      }),
    });
    return this.commands.execute(new CreateBindingCommand(b));
  }

  @Post(":id/apply")
  @HttpCode(200)
  async reapply(@Req() req: Request, @Param("id") id: string): Promise<Binding> {
    const binding = await this.find(parse(Id, id));
    if (binding) setAuditNote(req, { detail: bindingDetail("reapply", binding) });
    return this.commands.execute(new ReapplyBindingCommand(parse(Id, id)));
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Req() req: Request, @Param("id") id: string) {
    const binding = await this.find(parse(Id, id));
    if (binding) setAuditNote(req, { detail: bindingDetail("delete", binding) });
    await this.commands.execute(new DeleteBindingCommand(parse(Id, id)));
  }

  private async find(id: string): Promise<Binding | undefined> {
    const all = await this.queries.execute<ListBindingsQuery, Binding[]>(new ListBindingsQuery());
    return all.find((b) => b.id === id);
  }
}
