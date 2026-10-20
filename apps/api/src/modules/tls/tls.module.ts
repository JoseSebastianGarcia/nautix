import { type DynamicModule, Module } from "@nestjs/common";
import { TlsCertificates } from "./application/ports/tls-certificates.js";
import { TlsController } from "./presentation/tls.controller.js";

@Module({})
export class TlsModule {
  /** `certificates` is undefined when HTTPS is off; the page then shows how to turn it on. */
  static register(certificates: TlsCertificates | undefined): DynamicModule {
    return {
      module: TlsModule,
      controllers: [TlsController],
      providers: [
        {
          provide: TlsCertificates,
          useValue: certificates ?? new DisabledTls(),
        },
      ],
    };
  }
}

class DisabledTls extends TlsCertificates {
  status() {
    return { mode: "off" as const, hosts: [], validTo: null, fingerprint: null, ca: null };
  }
  caPem() {
    return null;
  }
  setHosts(): never {
    throw new Error("HTTPS is off");
  }
  setCustom(): never {
    throw new Error("HTTPS is off");
  }
  removeCustom(): never {
    throw new Error("HTTPS is off");
  }
}
