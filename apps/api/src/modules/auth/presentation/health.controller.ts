import { Controller, Get } from "@nestjs/common";
import { Public } from "./public.decorator.js";

@Controller("api/v1/health")
export class HealthController {
  @Public()
  @Get()
  health() {
    return { status: "ok" };
  }
}
