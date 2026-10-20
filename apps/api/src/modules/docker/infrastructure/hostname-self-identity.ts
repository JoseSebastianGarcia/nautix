import { SelfIdentity } from "../application/ports/self-identity.js";

/**
 * Inside a container the hostname defaults to the short container id, so a container whose id
 * starts with it is us. `NAUTIX_SELF_NAME` overrides this for custom hostnames or demo mode.
 */
export class HostnameSelfIdentity extends SelfIdentity {
  constructor(
    private readonly hostname: string,
    private readonly selfName: string | undefined,
  ) {
    super();
  }

  matches(container: { id: string; name: string }): boolean {
    if (this.selfName) return container.name === this.selfName;
    return this.hostname.length >= 12 && container.id.startsWith(this.hostname);
  }
}
