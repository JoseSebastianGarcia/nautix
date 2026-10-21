# Port guards

A published port is reachable by whatever can route to the address it is bound to. Guards let you decide who that is. There are three levels; each works on its own.

## 1. Exposure

The address a port is published on.

| Exposure | Bound to | Who can connect |
|---|---|---|
| Only this machine | `127.0.0.1` | this machine |
| One address | an address of the host, such as its LAN or VPN IP | whoever can reach that address |
| Everyone | `0.0.0.0` | anyone who can reach this machine |

Change it from the container's page. Docker cannot rebind a running port, so the container is recreated; if the new one fails, the old one is put back ([safe apply](help:safe-apply)). **System, Exposure** lists every published port, open ones first.

## 2. Gateway filters

A route in a gateway (Kong, nginx, Caddy, Traefik or HAProxy) can have an **allowed sources** list. Everyone else gets `403`. The route editor suggests your own address and warns you if the list would lock you out. Behind another proxy, the client address comes from `X-Forwarded-For`.

## 3. Host firewall

For any protocol, not just HTTP. Rules say which networks (such as `10.0.0.0/24`) may reach a published port; everyone else is dropped by the host's firewall (iptables or nftables).

![Guard rules and the helper status](img:guards)

Nautix stays unprivileged, so the rules are applied by a small separate **helper** container with host networking and the `NET_ADMIN` capability. It holds no data and opens no port: it asks Nautix for the rules and applies them. Create its token in **Resources, Guards** and run the command shown.

- **Trial window**: new rules apply for 60 seconds. Press **Keep these rules** or they are rolled back by themselves, even if you lose access.
- **Lock-out check**: a rule that would cut your own address, or guard Nautix itself, asks for an explicit confirmation.
- **Disable all guards** removes every rule. On the host, the emergency switch is `docker exec nautix-guard node dist/guard-helper.js --panic`.

> Linux only. With Docker Desktop or rootless Docker the helper cannot reach the host firewall.
