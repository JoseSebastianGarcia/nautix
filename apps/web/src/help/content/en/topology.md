# Topology and zones

The topology is the machine drawn as a diagram. Each **box** is a Docker network (a zone); the **nodes** inside it are the containers that share that network. Containers inside the same box can reach each other by name.

![The topology with two networks and their containers](img:topology)

## What you can do

- **Deploy**: drag from the palette onto a box. Dropped on the empty canvas, the service is external (not on any shared network) and its ports are bound to `127.0.0.1` only.
- **Move** a container to another box: it leaves its network and joins the new one after you confirm.
- **Join a second network**: a container on two networks bridges them. Use it for a reverse proxy that must reach isolated services.
- **Isolated networks** have no route to the outside: containers on them cannot reach the internet and cannot be reached from it.
- **Inspect**: click a node or a box to see its details, ports, environment, logs and actions in the inspector.
- **Auto layout** arranges everything again; positions you set by hand are saved.
- **Export Compose** writes the visible containers as a Compose file.

## Mounted folders and risky mounts
The deploy dialog and the template editor have a **Mounted folders** list: a folder of this machine (`/srv/data`) mapped to a folder inside the container (`/data`), optionally **read-only**. Use absolute paths. Some mounts are risky and are never silent: the **Docker socket** (it is root on the host), the **whole disk** (`/`) and **system folders** (`/etc`, `/root`, `/boot`, `/proc`, `/sys`, `/dev` and Docker's own data). When a mount is one of those, a red notice explains what it allows and **Deploy** stays disabled until you tick that you accept it. The server enforces the same rule, so a script or an API token cannot skip it.

## Delete by typing the name
Deleting a container, image, volume, network, Compose project, swarm service, stack, node, user, saved login or plugin asks you to **type its exact name** before the red *Delete* button unlocks, like GitHub does before deleting a repository. Case matters. Cancelling or closing the dialog clears what you typed.

## Port badges

Each published port shows who can reach it:

| Badge | Meaning |
|---|---|
| local only | bound to `127.0.0.1` |
| an address | bound to one address of this machine (LAN or VPN) |
| open | bound to every interface: anyone who can reach this machine can reach the port |

Change it from the container's page. See [Port guards](help:guards) to restrict who may connect.

## Cluster view

If this engine is in a swarm, a **Local server / Cluster** switch appears above the diagram. The cluster view draws the swarm's services and where their copies run; see [Cluster view and overlay networks](help:cluster). Without a swarm the switch does not exist.

## Lines between containers

A solid labelled line is a [binding](help:bindings): one container uses another and Nautix configured the connection.

## A zone as a document

Select a box and press **Edit as document** to see the whole zone as one YAML file. See [Zone document](help:zone-spec). A **drift** badge on a box means what runs no longer matches the last document you applied.

## Panels and shortcuts

Click an empty spot of the canvas to tuck the palette and the inspector away and see only the drawing. Selecting something brings the inspector back; the small tab on each edge shows or hides a panel by hand.

With something selected: **Ctrl+Delete** asks to remove it, **Ctrl+I** starts it and **Ctrl+.** stops it (Ctrl+Esc works too where the system does not keep it, as Windows does). Shortcuts stay quiet while you type or while a dialog is open. In the Swarm canvas, stop and start plan zero or one copy, and remove plans the removal, so nothing happens until you apply the plan.
