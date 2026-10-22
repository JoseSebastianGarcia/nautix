# Swarm

Docker Swarm turns one or more machines into a single cluster. Instead of running containers by hand you declare **services** ("3 copies of this image") and Swarm places them on the nodes, replaces the ones that fail and balances traffic between them.

## Concepts

| Term | Meaning |
|---|---|
| Node | A machine in the cluster. Managers decide; workers run tasks |
| Service | What you want running, with its number of replicas |
| Task | One running copy of a service |
| Stack | A group of services deployed together from a Compose file |
| Overlay network | A network that spans the nodes, so services reach each other by name |
| Secret / config | Sensitive or plain files delivered to services |

## In Nautix

**Swarm**, in the main menu (and also as a tab under **Resources**), has tabs for services, nodes, stacks, secrets, configs and the cluster. You can create a swarm on this engine or join an existing one with the manager's address and a token, scale services up and down, and read each task's state and error.

While no swarm is connected, the Topology shows a floating **Connect to Swarm** button: it starts a swarm on this engine or joins an existing one, and once connected the same page switches to the cluster.

- Only a **manager** can manage the cluster. On a worker, Nautix tells you to use a manager.
- A port published by a service opens on **every node**, on all interfaces.
- Removing a service stops its tasks; volumes are not touched.

## When to use it

Swarm is worth it when you want services to keep running if a machine goes down, or to spread load over several machines. For a single machine it adds nothing.

## What it does not cover

Containers created with `docker run` are not services, so the Swarm tab does not show them. Topology, bindings, zone documents and port guards work on one Docker engine at a time; they do not follow a service across nodes.

> The nodes talk to each other on ports 2377 (tcp), 7946 (tcp and udp) and 4789 (udp). Open them only on a private network or a VPN, never to the internet.

If you just need two separate servers to talk to each other, a VPN (WireGuard, Tailscale) between them plus one Nautix per server is simpler.

With a swarm active, Topology also shows the whole cluster (services, copies and where they run) in a read-only view: see [Cluster view and overlay networks](help:cluster).
