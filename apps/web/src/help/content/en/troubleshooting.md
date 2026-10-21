# Troubleshooting

## A change was rolled back

The new container did not start or did not become healthy. The message shows the reason and the last log lines. Fix the cause (a wrong value, a missing dependency, a port already in use) and try again. The previous container is running meanwhile. See [Safe apply](help:safe-apply).

## A binding says the two cannot be bound

Check that the service is on a network you created. The default bridge has no name resolution.

## "could not translate host name"

The app and the service are not on a shared user-defined network. Create a [binding](help:bindings) or join the app to the service's network.

## A port is not reachable from another machine

Published ports are bound to `127.0.0.1` by default. Change the exposure to one address or to everyone from the container's page, then check any [guard](help:guards) rule on that port.

## The port is already allocated

Another container or program uses that host port. Pick another one, or stop the other.

## My DNS names do not resolve

- The machine asking must use your DNS container as its resolver.
- Port 53 must be published on an address that machine can reach.
- Use **Ask the server** in **Resources, DNS** to test the record directly.

## Windows and WSL

- The WSL2 distribution stops when no `wsl.exe` session is open, and Docker with it. A keep-alive entry at startup avoids this.
- Without administrator rights you cannot open ports in the Windows firewall, so other machines on your network cannot reach WSL. Mirrored networking needs Windows 11 22H2 or later.
- In the default NAT mode, UDP ports (such as DNS) are not forwarded to `localhost`.
- A VPS or a Linux server is the simplest place for Docker if the corporate machine is restricted.

## Locked out by a guard rule

Rules applied on trial roll back by themselves after 60 seconds. On the host: `docker exec nautix-guard node dist/guard-helper.js --panic` removes all of Nautix's firewall rules.

## Forgot the password

Ask an admin to reset it in **Settings, Users**.
