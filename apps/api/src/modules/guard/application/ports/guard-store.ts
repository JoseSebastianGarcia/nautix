import type { GuardState } from "../../domain/guard-state.js";

export abstract class GuardStore {
  abstract load(): Promise<GuardState>;
  abstract save(state: GuardState): Promise<void>;
  /** New helper token; the previous one stops working. Only its hash is stored. */
  abstract createToken(): Promise<string>;
  abstract verifyToken(raw: string): Promise<boolean>;
  abstract hasToken(): Promise<boolean>;
}
