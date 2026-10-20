import { TlsCustomCertificate, TlsHosts } from "@nautix/contracts";
import { Body, Controller, Delete, Get, Header, Inject, Put } from "@nestjs/common";
import { NotFoundError } from "../../../shared/domain-error.js";
import { parse } from "../../../shared/zod-body.js";
import { AdminOnly } from "../../auth/presentation/admin-only.decorator.js";
import { TlsCertificates } from "../application/ports/tls-certificates.js";

@AdminOnly()
@Controller("api/v1/settings/tls")
export class TlsController {
  constructor(@Inject(TlsCertificates) private readonly tls: TlsCertificates) {}

  @Get()
  status() {
    return this.tls.status();
  }

  /** The local root CA (public part): install it once in the OS / browser to trust Nautix. */
  @Get("ca.pem")
  @Header("Content-Type", "application/x-pem-file")
  @Header("Content-Disposition", 'attachment; filename="nautix-local-ca.pem"')
  ca() {
    const pem = this.tls.caPem();
    if (!pem) throw new NotFoundError("no local CA", "errors.notFound");
    return pem;
  }

  @Put("hosts")
  hosts(@Body() body: unknown) {
    return this.tls.setHosts(parse(TlsHosts, body).hosts);
  }

  @Put("custom")
  custom(@Body() body: unknown) {
    const { cert, key } = parse(TlsCustomCertificate, body);
    return this.tls.setCustom(cert, key);
  }

  @Delete("custom")
  removeCustom() {
    return this.tls.removeCustom();
  }
}
