import type { GatewayKind, GatewayRoute } from "@nautix/contracts";
import { ValidationError } from "../../../shared/domain-error.js";
import type { TarFile } from "./tar.js";

/** How a gateway gets its routes: Kong through its admin API, the others through files + a reload. */
export type GatewayPlan =
  | { mode: "kong"; yaml: string }
  | { mode: "files"; files: TarFile[]; commands: string[][] };

/**
 * Strategy: one implementation per gateway type. Adding a type means adding a class and listing
 * it in the registry; the handler, controller and UI do not change.
 */
export abstract class GatewayStrategy {
  abstract readonly kind: GatewayKind;

  /** Turns validated routes into the delivery plan for this gateway type. */
  plan(routes: GatewayRoute[]): GatewayPlan {
    this.assertNoDuplicates(routes);
    return this.build(routes);
  }

  protected abstract build(routes: GatewayRoute[]): GatewayPlan;

  private assertNoDuplicates(routes: GatewayRoute[]): void {
    const seen = new Set<string>();
    for (const r of routes) {
      const key = `${r.host ?? "*"}|${r.path ?? "/"}`;
      if (seen.has(key))
        throw new ValidationError(
          `two routes share ${r.host ?? "*"}${r.path ?? "/"}`,
          "errors.gatewayDuplicateRoute",
        );
      seen.add(key);
    }
  }
}
