import { describe, expect, it, vi } from "vitest";
import type { StackRunner } from "../ports/stack-runner.js";
import { DeployStackCommand } from "./deploy-stack.command.js";
import { DeployStackHandler } from "./deploy-stack.handler.js";

const runner = () => {
  const deploy = vi.fn().mockResolvedValue({ ok: true, exitCode: 0, output: "" });
  return { deploy, runner: { deploy } as unknown as StackRunner };
};

const SAFE = "services:\n  web:\n    image: nginx\n";
const HOST_MOUNT = "services:\n  web:\n    image: nginx\n    volumes: ['/home:/h']\n";

describe("DeployStackHandler (ADR-063)", () => {
  it("deploys a file with no risk", async () => {
    const { deploy, runner: r } = runner();
    await new DeployStackHandler(r).execute(new DeployStackCommand("shop", SAFE, false));
    expect(deploy).toHaveBeenCalledWith("shop", SAFE);
  });

  it("refuses a host mount that was not acknowledged", () => {
    const { deploy, runner: r } = runner();
    expect(() =>
      new DeployStackHandler(r).execute(new DeployStackCommand("shop", HOST_MOUNT, false)),
    ).toThrow(/acknowledge/);
    expect(deploy).not.toHaveBeenCalled();
  });

  it("deploys it once the risk is acknowledged", async () => {
    const { deploy, runner: r } = runner();
    await new DeployStackHandler(r).execute(new DeployStackCommand("shop", HOST_MOUNT, true));
    expect(deploy).toHaveBeenCalledOnce();
  });
});
