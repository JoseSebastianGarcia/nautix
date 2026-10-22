# Cluster view and overlay networks

When this engine is part of a swarm, Topology gets a second view: the **cluster** as its manager sees it. Without a swarm nothing changes: no new tab, no new option.

![The cluster by network: two overlay zones, with services, copies and the server each one runs on](img:cluster-network)

## When it appears

- **Topology → Local server / Cluster** shows up only when this engine is in a swarm.
- It needs a **manager**. On a worker, or on a locked swarm, the view says why and points to the Swarm tab instead of showing something incomplete.
- It is **read-only**. To create or change services use the Swarm tab; the inspector has a button that takes you there.

## By network

Each **overlay network** is a box with a double line, the name, its subnet and a padlock when it is encrypted. A coloured bus runs down the box and every service hangs from it.

A service card shows:

| What | Meaning |
|---|---|
| `3/3` | copies running out of the copies wanted: green when all are up, amber when some are missing, red when none runs |
| `global` | one copy on every node |
| a chip per copy | the server where it runs: **●** running, **◌** waiting, **✕** failed (hover for the error) |
| "N waiting for a place" | copies the cluster wants but has not been able to start yet |
| "Port 443 open on every node" | a published port is open on all the servers, on all interfaces |

Services that are on no overlay network go to a box of their own at the end.

## By server

![The same cluster by server: what runs on each node](img:cluster-server)

One column per server, managers first. Inside are the tasks that run there, with the networks they are on as coloured tags (the legend is at the top). A server that does not answer is drawn in red: the cluster has already created its tasks again elsewhere.

## The nodes panel and the inspector

- **Nodes**: role, address, availability (active, paused, draining), leader and how many tasks each one holds. Click one to highlight its tasks in the drawing.
- A warning appears when there are fewer than **three managers**: with one or two, losing a manager leaves the cluster unable to decide.
- **Inspector**: the service's mode, copies running, networks and a table of its tasks with the server and the error of the ones that failed.

## Overlay networks

![New network, with the overlay option](img:cluster-overlay)

**New network** shows the choice **Local** or **Overlay** only when the engine is in a swarm.

- An **overlay** network spans every server of the swarm: services find each other by name wherever they run.
- **Encrypt the traffic between servers** comes ticked. Docker leaves it off by default, and then the traffic between servers travels in the clear.
- **Attachable** lets standalone containers (`docker run`) join, not only services.
- On a **worker**, or on a **locked** swarm, the option is disabled and says why. If you try anyway through the API the answer is the same: an overlay needs a swarm manager.

In the local topology an overlay network is drawn with a double line too.

## Leaving the swarm

![Leaving the swarm lists what is affected](img:cluster-leave)

The dialog lists the **overlay zones** that are left without a cluster and the **services** that stop on this node. Volumes are not touched and standalone containers keep running. If this is the **last manager**, leaving dissolves the cluster and the dialog says so.

## What it does not show

- **Standalone containers** of other servers: a manager only knows about services. To see them Nautix needs a connection to that server's Docker.
- **Images and volumes** of other nodes.
- **Who talks to whom.** Docker says which services belong to a network, not the traffic between them. The lines are membership, not conversations.
- **Two swarms** are two separate clusters: a network never spans both.

See also [Swarm](help:swarm) and [Topology and zones](help:topology).
