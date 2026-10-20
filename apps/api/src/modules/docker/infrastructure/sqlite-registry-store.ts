import type { RegistryAuth, RegistryInfo } from "@nautix/contracts";
import type { Db } from "../../../shared/sqlite-database.js";
import { RegistryStore } from "../application/ports/registry-store.js";
import { serverAddress } from "../domain/registry-host.js";
import type { AesGcmCipher } from "./aes-gcm-cipher.js";

export class SqliteRegistryStore extends RegistryStore {
  constructor(
    private readonly db: Db,
    private readonly cipher: AesGcmCipher,
  ) {
    super();
    db.exec(`CREATE TABLE IF NOT EXISTS registries (
      server TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      secret TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  }

  list(): RegistryInfo[] {
    return this.db
      .prepare("SELECT server, username FROM registries ORDER BY server")
      .all() as RegistryInfo[];
  }

  find(server: string): RegistryAuth | undefined {
    const row = this.db
      .prepare("SELECT username, secret FROM registries WHERE server = ?")
      .get(server) as { username: string; secret: string } | undefined;
    if (!row) return undefined;
    return {
      username: row.username,
      password: this.cipher.decrypt(row.secret),
      serveraddress: serverAddress(server),
    };
  }

  save(server: string, username: string, password: string): void {
    this.db
      .prepare(
        `INSERT INTO registries (server, username, secret, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(server) DO UPDATE SET username = excluded.username,
           secret = excluded.secret, updated_at = excluded.updated_at`,
      )
      .run(server, username, this.cipher.encrypt(password), Date.now());
  }

  remove(server: string): boolean {
    return this.db.prepare("DELETE FROM registries WHERE server = ?").run(server).changes > 0;
  }
}
