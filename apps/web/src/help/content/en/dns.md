# DNS

Give your own names (such as `app.home.lab`) an IP address. Containers and machines that use your DNS container as their resolver find them; every other name is forwarded to the upstream DNS.

![DNS records for a local domain](img:dns)

## Set up

1. Deploy **dnsmasq** or **CoreDNS** from the palette (Topology, DNS category). It shows up in **Resources, DNS**.
2. Add records: a domain and an IP address, or pick a container and use its IP. A record also covers subdomains (`db.app.lab` gets the same address as `app.lab`).
3. **Save and apply**. Nautix writes the records into the DNS container and restarts or reloads it (dnsmasq restarts, about a second without DNS).
4. **Ask the server** tests a name against it.

## Using it

- **Containers** on the DNS container's network can use it as their resolver.
- **Other machines** need their network settings (or your router) pointed at the machine running the DNS container, and its port 53 published to an address they can reach. A port bound to `127.0.0.1` answers only this machine.

## Who can use your names

Only whoever uses your DNS server as their resolver. A DNS container does not make names visible to the internet. Publish port 53 only where you mean it: an open DNS server on a public address can be abused for amplification attacks. See [Port guards](help:guards).

## Records stay valid

A record that points to a container follows it by name, not by IP, so it keeps working after the container is recreated.
