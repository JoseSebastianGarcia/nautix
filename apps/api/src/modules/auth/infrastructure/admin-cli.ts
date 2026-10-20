import { randomBytes, randomUUID } from "node:crypto";
import type { Db } from "../../../shared/sqlite-database.js";
import type { PasswordHasher } from "../application/ports/password-hasher.js";
import { SqliteSessionRepository } from "./sqlite-session.repository.js";
import { SqliteUserRepository } from "./sqlite-user.repository.js";

export type CliResult = { ok: true; message: string } | { ok: false; message: string };

/** A readable one-time password: 24 characters from an alphabet without look-alikes. */
export const generatePassword = (): string => {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(24), (b) => alphabet[b % alphabet.length]).join("");
};

export const USAGE = `Usage:
  reset-password <username>   set a new random password and sign the user out everywhere
  create-admin <username>     create an admin with a random password (or promote and reset an existing user)
The new password is printed once. Run it inside the container:
  docker exec <container> node dist/cli.js reset-password admin`;

/**
 * Emergency access: runs next to the database, so whoever can run commands in the container
 * (that is, whoever already controls the host) can recover a locked-out installation.
 */
export const runAdminCli = async (
  args: string[],
  db: Db,
  hasher: PasswordHasher,
): Promise<CliResult> => {
  const [command, username] = args;
  if ((command !== "reset-password" && command !== "create-admin") || !username)
    return { ok: false, message: USAGE };
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))
    return { ok: false, message: "invalid username (3-32 letters, digits, . _ -)" };
  const users = new SqliteUserRepository(db);
  const sessions = new SqliteSessionRepository(db);
  const existing = await users.findByUsername(username);
  const password = generatePassword();
  const hash = await hasher.hash(password);
  if (command === "reset-password") {
    if (!existing) return { ok: false, message: `user "${username}" does not exist` };
    await users.setPasswordHash(existing.id, hash);
    await sessions.removeForUser(existing.id);
  } else if (existing) {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    await users.setPasswordHash(existing.id, hash);
    await sessions.removeForUser(existing.id);
  } else {
    await users.add({ id: randomUUID(), username, passwordHash: hash, role: "admin" });
  }
  db.exec(
    `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, action TEXT NOT NULL, status INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '')`,
  );
  db.prepare(
    "INSERT INTO audit_log (at, actor, kind, action, status, detail) VALUES (?, 'cli', 'cli', ?, 0, ?)",
  ).run(Date.now(), `cli ${command}`, username);
  return { ok: true, message: `Password for "${username}": ${password}` };
};
