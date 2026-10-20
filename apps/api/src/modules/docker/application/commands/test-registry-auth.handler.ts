import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import { DockerEngine } from "../ports/docker-engine.js";
import { TestRegistryAuthCommand } from "./test-registry-auth.command.js";

@CommandHandler(TestRegistryAuthCommand)
export class TestRegistryAuthHandler implements ICommandHandler<TestRegistryAuthCommand, string> {
  constructor(@Inject(DockerEngine) private readonly engine: DockerEngine) {}

  execute(q: TestRegistryAuthCommand): Promise<string> {
    return this.engine.testRegistryAuth(q.auth);
  }
}
