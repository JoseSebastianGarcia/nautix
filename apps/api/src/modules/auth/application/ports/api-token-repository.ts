import type { ApiToken } from "../../domain/api-token.js";

export abstract class ApiTokenRepository {
  abstract add(token: ApiToken): Promise<void>;
  abstract list(): Promise<ApiToken[]>;
  abstract findByHash(tokenHash: string): Promise<ApiToken | null>;
  abstract touch(id: string, at: number): Promise<void>;
  abstract remove(id: string): Promise<void>;
}
