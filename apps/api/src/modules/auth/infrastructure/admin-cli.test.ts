import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../../../shared/sqlite-database.js";
import { generatePassword, runAdminCli } from "./admin-cli.js";
import { ScryptPasswordHasher } from "./scrypt-password-hasher.js";

const setup = () => {
  const db = openDatabase(mkdtempSync(join(tmpdir(), "nautix-cli-")));
  return { db, hasher: new ScryptPasswordHasher() };
};

const hashOf = (db: ReturnType<typeof openDatabase>, name: string): string | undefined =>
  (
    db.prepare("SELECT password_hash AS h FROM users WHERE username = ?").get(name) as
      | { h: string }
      | undefined
  )?.h;

describe("admin CLI", () => {
  it("creates an admin with a random password that verifies", async () => {
    const { db, hasher } = setup();
    const result = await runAdminCli(["create-admin", "root"], db, hasher);
    expect(result.ok).toBe(true);
    const password = /: (\S+)$/.exec(result.message)?.[1] ?? "";
    expect(password).toHaveLength(24);
    expect(await hasher.verify(password, hashOf(db, "root") ?? "")).toBe(true);
    expect(db.prepare("SELECT role FROM users WHERE username='root'").get()).toEqual({
      role: "admin",
    });
  });

  it("resets a password, signs the user out and leaves an audit trail", async () => {
    const { db, hasher } = setup();
    await runAdminCli(["create-admin", "root"], db, hasher);
    const id = (db.prepare("SELECT id FROM users WHERE username='root'").get() as { id: string })
      .id;
    db.prepare(
      "INSERT INTO sessions (token_hash, user_id, username, expires_at) VALUES ('h', ?, 'root', ?)",
    ).run(id, Date.now() + 60_000);
    const before = hashOf(db, "root");
    const result = await runAdminCli(["reset-password", "root"], db, hasher);
    expect(result.ok).toBe(true);
    expect(hashOf(db, "root")).not.toBe(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
    const trail = db
      .prepare("SELECT actor, action, detail FROM audit_log ORDER BY id DESC LIMIT 1")
      .get();
    expect(trail).toEqual({ actor: "cli", action: "cli reset-password", detail: "root" });
  });

  it("promotes an existing viewer when asked to create an admin with that name", async () => {
    const { db, hasher } = setup();
    db.prepare(
      "INSERT INTO users (id, username, password_hash, role) VALUES ('1', 'ana', 'x', 'viewer')",
    ).run();
    expect((await runAdminCli(["create-admin", "ana"], db, hasher)).ok).toBe(true);
    expect(db.prepare("SELECT role FROM users WHERE username='ana'").get()).toEqual({
      role: "admin",
    });
  });

  it("rejects unknown users, bad names and bad usage", async () => {
    const { db, hasher } = setup();
    expect((await runAdminCli(["reset-password", "ghost"], db, hasher)).ok).toBe(false);
    expect((await runAdminCli(["reset-password", "a b"], db, hasher)).ok).toBe(false);
    expect((await runAdminCli(["nope"], db, hasher)).message).toContain("Usage");
    expect((await runAdminCli([], db, hasher)).ok).toBe(false);
  });

  it("generates different passwords", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});
