# Getting started

Nautix manages the Docker engine on this machine from the browser: containers, images, volumes, networks, Compose projects and builds. Everything you do is a Docker action, and each one can show you the equivalent `docker` command.

## Where things are

| Menu | What it is for |
|---|---|
| Topology | The whole machine as a diagram: networks are boxes, containers sit inside them |
| Resources | Lists and tabs for containers, images, volumes, networks, builds, gateways, DNS, guards and Swarm |
| Compose | Compose projects, with a visual editor and the YAML side by side |
| System | Engine information, disk usage, the prune wizard, events and the exposure inventory |

The icons at the top right switch theme and language, change your password, open Settings (admins) and this help.

## Your first container

1. Open **Topology**.
2. Drag an item from the palette (a database, a proxy, any image) onto a network box.
3. Fill in the name and the port, then deploy.

Published ports listen on `127.0.0.1` only, so nothing is reachable from outside this machine until you decide otherwise (see [Port guards](help:guards)).

> Destructive actions (remove, prune) always list what will be affected before they ask you to confirm.

## Roles

Admins can change things. Viewers can look but not change anything, cannot open terminals and do not see environment values.

## Next

- [Topology and zones](help:topology)
- [Bindings: connect an app to a service](help:bindings)
- [Safe apply and rollback](help:safe-apply)
- [Troubleshooting](help:troubleshooting)
