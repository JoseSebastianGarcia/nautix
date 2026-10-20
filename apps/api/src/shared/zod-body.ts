import type { ZodType } from "zod";

/** Validates a request body/query with a contracts schema; ZodError is mapped by ProblemFilter. */
export const parse = <T>(schema: ZodType<T>, input: unknown): T => schema.parse(input);
