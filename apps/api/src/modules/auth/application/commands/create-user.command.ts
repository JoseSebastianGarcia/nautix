import type { CreateUser } from "@nautix/contracts";

export class CreateUserCommand {
  constructor(public readonly request: CreateUser) {}
}
