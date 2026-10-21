import { z } from "zod";
import { ResourceName } from "./docker.js";
import { ApplyGate } from "./recreate.js";

/** Services Nautix knows how to wire an app to (recognised from the provider's image). */
export const BINDING_KINDS = [
  "postgres",
  "mysql",
  "mariadb",
  "redis",
  "mongodb",
  "sqlserver",
  "rabbitmq",
  "http",
] as const;
export type BindingKind = (typeof BINDING_KINDS)[number];

const PATTERNS: [Exclude<BindingKind, "http">, RegExp][] = [
  ["postgres", /(^|\/)(postgres|postgresql|timescaledb|pgvector)(:|$|@)/],
  ["mariadb", /(^|\/)mariadb(:|$|@)/],
  ["mysql", /(^|\/)mysql(:|$|@)/],
  ["redis", /(^|\/)(redis|valkey|keydb)(:|$|@)/],
  ["mongodb", /(^|\/)mongo(db)?(:|$|@)/],
  ["sqlserver", /mssql|sql-?server/],
  ["rabbitmq", /(^|\/)rabbitmq(:|$|@)/],
];

/** What the provider is, from its image; anything else is plain HTTP. */
export const bindingKind = (image: string): BindingKind =>
  PATTERNS.find(([, re]) => re.test(image.toLowerCase()))?.[0] ?? "http";

export const BINDING_STYLES = ["dotnet", "url"] as const;
export type BindingStyle = (typeof BINDING_STYLES)[number];

export const CreateBinding = z.object({
  consumer: ResourceName,
  provider: ResourceName,
  /** Names the settings: `ConnectionStrings__<Name>` or `<NAME>_URL`. Defaults to the provider's name. */
  name: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9]{0,40}$/, "letters and numbers, starting with a letter")
    .optional(),
  style: z.enum(BINDING_STYLES).default("dotnet"),
  gate: ApplyGate.optional(),
});
export type CreateBinding = z.infer<typeof CreateBinding>;
export type CreateBindingInput = z.input<typeof CreateBinding>;

export interface Binding {
  id: string;
  consumer: string;
  provider: string;
  kind: BindingKind;
  name: string;
  style: BindingStyle;
  /** Names of the variables this binding put in the consumer (so removing it removes exactly those). */
  variables: string[];
}

export interface BindingPlan {
  kind: BindingKind;
  /** Network both containers share after applying. */
  network: string;
  /** The consumer has to join it (it is not on it yet). */
  joins: boolean;
  /** Variable names with their values, passwords masked. */
  variables: { key: string; preview: string }[];
  /** Applying recreates the consumer (behind the health gate). */
  recreates: true;
}

/** The name a binding gets when none is given: the provider's name, letters and numbers only. */
export const defaultBindingName = (provider: string): string => {
  const clean = provider.replace(/[^A-Za-z0-9]/g, "");
  return /^[A-Za-z]/.test(clean) ? clean : `Svc${clean}`;
};
