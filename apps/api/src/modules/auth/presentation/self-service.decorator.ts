import { SetMetadata } from "@nestjs/common";

export const SELF_SERVICE = "nautix:selfService";
/** A mutation every signed-in user may do for themselves, viewers included (e.g. change own password). */
export const SelfService = () => SetMetadata(SELF_SERVICE, true);
