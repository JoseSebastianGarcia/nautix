# Cluster view and overlay networks

When this engine is part of a swarm, Topology gets a second view: the **cluster** as its manager sees it. Without a swarm nothing changes: no new tab, no new option.

The cluster has three drawings: the **Canvas**, where you build, and **By network** and **By server**, which only show.

## Canvas: build services on overlay networks

![The canvas: services inside their overlay, one being created (dashed), another with changes waiting, a binding line and the plan bar](img:cluster-canvas)

Each **overlay network** is a box and each **service** a node inside it, with its logo, copies running (`3/3`), published ports, a **dot per copy in the colour of the server it runs on** (hollow when the copy is not well; the legend at the top lists the servers) and small icons: **pin** (it is tied to a node or a role), **drive** (it has volumes), **key** (it receives secrets) and **↺** (its last update was rolled back). Move boxes and nodes as in the local topology; positions are saved. A service on two overlays is drawn in the first and linked to the other by a dashed line.

Every change you make waits, dashed, in a **plan**; nothing happens until you apply it.

### Create a service

![Creating a service from a template: copies, network, where it runs, volumes, ports, secrets and environment](img:cluster-service)

Drag a template onto an overlay box (or click it). Name, image, copies (or one on every node), network and environment come prefilled, and you choose:

- **Where it runs**: any node, worker nodes only, manager nodes only, or **pinned to one node**; plus an optional limit of copies per node.
- **Volumes**: named volumes mounted in the container. A template that asks for data paths brings them. **A volume lives on the node where a copy runs**: if the service can move to another node, the copy that lands there starts with an empty volume. That is why a service with volumes starts **pinned to a node**, and the dialog warns when you leave it free.
- **Ports to publish**: a published port opens on every node, on all interfaces. A port you do not publish is still reachable by the other services of the network.
- **Secrets**: tick the Swarm secrets it should receive; each appears inside the container as the file `/run/secrets/<name>`. Create them in **Swarm, Secrets**.

### Change an existing service

Select it: the inspector shows what it is and what you can change.

- **Copies**: **− / +**.
- **Image**: type the new one and press **Set**. It rolls out one copy at a time (or stop-first when it has volumes). If the new copies do not start, the engine **puts the previous image back by itself**, and the plan reports it.
- **Move to overlay**: pick another overlay in the list, or **drag the node onto another box**. It leaves the old overlay and joins the new one.
- **Where it runs**: change the role, pin it to a node or limit the copies per node.
- **Roll back to the previous version**: goes back to the settings it had before its last update (image, networks, placement). This one is done at once, after you confirm.
- **Remove from the cluster**: the node is drawn crossed out. Removals are applied **last** and cannot be undone: the service's volumes and secrets stay, but its settings cannot be rebuilt from here.

### Bind two services

Each node has a small dot on both sides. **Drag from one service's dot to another's** to bind them: the first receives the connection settings of the second (a connection string for PostgreSQL, MySQL, SQL Server, MongoDB, Redis, RabbitMQ, or a URL) in its environment, and reaches it by name over the overlay they share. The preview shows the variables with passwords masked. The first service joins the second one's overlay if it was not on it. The line is drawn with the kind of service; to remove it, **Unbind** in the first service's inspector.

### The plan

![A plan that fails: the service never starts and everything is undone](img:cluster-plan)

**Review and apply** lists each change with its `docker service` command (environment values are never shown). **Discard** drops them all; **Remove from plan** drops one.

- **Applying** goes one change at a time and waits for the result: for a new service, until its copies run; for an update, a binding or a move, until the rolling update finishes. If a change fails, **everything the plan already did is undone**: created services are removed, scaled or updated ones go back to what they were, a binding is taken out, and a binding that was removed is put back. The dialog says what failed and why.
- Removals come last. If a removal fails, the ones before it stay removed (and the dialog says so); everything else is undone.
- Nothing is removed that the plan did not create or that you did not ask to remove.

![The cluster by network: two overlay zones, with services, copies and the server each one runs on](img:cluster-network)

## When it appears

- **Topology → Local server / Cluster** shows up only when this engine is in a swarm.
- It needs a **manager**. On a worker, or on a locked swarm, the view says why and points to the Swarm tab instead of showing something incomplete.
- **By network** and **By server** are read-only. The **Canvas** builds and changes services through a plan.

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
- **Who talks to whom** beyond the bindings you made. Docker says which services belong to a network, not the traffic between them: the dashed lines are membership, only the labelled ones are bindings.
- **Two swarms** are two separate clusters: a network never spans both.

See also [Swarm](help:swarm) and [Topology and zones](help:topology).
