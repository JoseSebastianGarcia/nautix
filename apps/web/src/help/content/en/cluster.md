# Cluster view and overlay networks

When this engine is part of a swarm, Topology gets a second view: the **cluster** as its manager sees it. Without a swarm nothing changes: no new tab, no new option.

The cluster has three drawings: the **Canvas**, where you build, and **By network** and **By server**, which only show.

## Canvas: build services on overlay networks

![The canvas: services inside their overlay, a service being created (dashed) and one being scaled, with the plan bar](img:cluster-canvas)

Each **overlay network** is a box and each **service** a node inside it, with its logo, copies running (`3/3`) and published ports. Move boxes and nodes as in the local topology; positions are saved. A service on two overlays is drawn in the first and linked to the other by a dashed line.

- **Create a service**: drag a template onto an overlay box (or click it). Name, image, copies (or one on every node), network, the ports to publish and the environment come prefilled. Nothing is created yet: the service appears **dashed and marked new**.
- **Scale a service**: select it and use **− / +** in the inspector. It shows `1 → 2` until you apply.
- **Plan bar**: every change waits in a plan (**Discard** drops them all, **Remove from plan** drops one). **Review and apply** lists each change with its `docker service` command.

![A plan that fails: the service never starts and everything is undone](img:cluster-plan)

- **Applying** goes one change at a time and waits for each service to have its copies running, like `docker service create` does. If a change fails, or a service does not start, everything the plan already did is **undone**: created services are removed and scaled ones go back to their copies. The dialog says what failed and why. Nothing is removed that the plan did not create.
- A **published port** opens on every node of the swarm, on all interfaces; the dialog warns about it. A port you do not publish is still reachable by the other services of the network.
- A template that asks for **volumes** creates the service **without them** for now (the dialog says so): data would not survive a restart on another node.
- **Removing** a service, changing its image or moving it to another network is not done from the canvas: use the Swarm tab.

![The cluster by network: two overlay zones, with services, copies and the server each one runs on](img:cluster-network)

## When it appears

- **Topology → Local server / Cluster** shows up only when this engine is in a swarm.
- It needs a **manager**. On a worker, or on a locked swarm, the view says why and points to the Swarm tab instead of showing something incomplete.
- **By network** and **By server** are read-only. The **Canvas** creates and scales services through the plan above.

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
