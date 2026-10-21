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

## Port badges

Each published port shows who can reach it:

| Badge | Meaning |
|---|---|
| local only | bound to `127.0.0.1` |
| an address | bound to one address of this machine (LAN or VPN) |
| open | bound to every interface: anyone who can reach this machine can reach the port |

Change it from the container's page. See [Port guards](help:guards) to restrict who may connect.

## Lines between containers

A solid labelled line is a [binding](help:bindings): one container uses another and Nautix configured the connection.

## A zone as a document

Select a box and press **Edit as document** to see the whole zone as one YAML file. See [Zone document](help:zone-spec). A **drift** badge on a box means what runs no longer matches the last document you applied.
