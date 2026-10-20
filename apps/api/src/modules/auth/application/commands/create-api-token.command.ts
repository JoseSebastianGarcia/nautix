import type { CreateToken } from "@nautix/contracts";

export class CreateApiTokenCommand {
  constructor(public readonly request: CreateToken) {}
}
