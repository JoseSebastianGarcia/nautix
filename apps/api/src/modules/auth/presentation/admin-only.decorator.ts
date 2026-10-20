import { SetMetadata } from "@nestjs/common";

export const ADMIN_ONLY = "nautix:adminOnly";
/** Restricts a handler to admins even for GET (e.g. listing tokens). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
