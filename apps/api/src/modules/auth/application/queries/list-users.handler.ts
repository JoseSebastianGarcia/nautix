import type { UserInfo } from "@nautix/contracts";
import { Inject } from "@nestjs/common";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { UserRepository } from "../ports/user-repository.js";
import { ListUsersQuery } from "./list-users.query.js";

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery, UserInfo[]> {
  constructor(@Inject(UserRepository) private readonly users: UserRepository) {}

  async execute(): Promise<UserInfo[]> {
    return (await this.users.list()).map(({ id, username, role }) => ({ id, username, role }));
  }
}
