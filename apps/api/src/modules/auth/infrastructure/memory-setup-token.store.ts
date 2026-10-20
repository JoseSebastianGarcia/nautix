import { randomBytes } from "node:crypto";
import { SetupTokenStore } from "../application/ports/setup-token-store.js";

export class MemorySetupTokenStore extends SetupTokenStore {
  private token: string | null;

  constructor(needed: boolean) {
    super();
    this.token = needed ? randomBytes(12).toString("base64url") : null;
  }

  current(): string | null {
    return this.token;
  }

  consume(): void {
    this.token = null;
  }
}
