# Trying Swarm with two machines

What you need: two Linux machines (VPS, mini-PCs, VMs) that can reach each other, Docker 25 or newer on both (same major version), and Nautix on **one** of them. The second machine only needs Docker: Nautix manages the cluster through the first one.

> WSL2 in its default NAT mode is not a good place for this: the other machine cannot reach it. Use a VPS, a Linux VM with a bridged network, or WSL2 with mirrored networking.

## 1. Open the ports between the two machines only

| Port | Use |
|---|---|
| `2377/tcp` | cluster management (managers) |
| `7946/tcp` and `7946/udp` | node discovery |
| `4789/udp` | overlay traffic (VXLAN) |
| IP protocol `50` (ESP) | only if you tick **encrypt the traffic** on an overlay |

Open them for the other machine's address, **never to the internet**. Easiest and safest: put both machines on a private network or a VPN (WireGuard, Tailscale) and use those addresses. With a VPN, lower the overlay MTU if traffic hangs (Tailscale uses 1280).

With `ufw`: `ufw allow from <other-ip> to any port 2377,7946 proto tcp`, then the same for `7946` and `4789` with `proto udp`.

## 2. Start the swarm on machine 1 (Nautix)

1. Open Nautix → **Topology**. Click the floating **Connect to Swarm** button.
2. **Advertise address**: the private/VPN address of this machine that the other one can reach (not `127.0.0.1`, not a public address you do not want to use). **Initialize swarm**.
3. The page switches to **Cluster → Canvas**. Open **Swarm → Cluster** (or the Swarm menu entry) and copy the **worker join token** and the manager address (`<address>:2377`).

## 3. Join machine 2

On machine 2, as a user that can run Docker:

```
docker swarm join --token <worker-token> <machine-1-address>:2377
```

Back in Nautix the node appears under **Swarm → Nodes** and in the **Servers** legend of the canvas within seconds. If it does not: the ports of step 1, the advertise address, or a firewall at the provider.

## 4. A test plan that shows everything working

Do each step from the canvas and watch the dots of each service (one per copy, coloured by server).

1. **Overlay**: **New network → Overlay**, name `lab`, keep *encrypted* ticked only if you opened ESP.
2. **Spread**: drag a template (for example Nginx) onto `lab`, 4 copies. **Review and apply.** Expect two dots of each colour.
3. **Same network, two machines**: create a second service on `lab` (for example `redis`). In the terminal of one Nginx copy: `getent hosts redis` must resolve, and `wget -qO- http://<name>` between services of different machines proves the overlay carries traffic.
4. **Workers only / pinned**: create a service with **Worker nodes only**, then one with **Pinned to one node** and a volume: it must never leave that node.
5. **Per-node limit**: 4 copies with *at most 1 per node* on two machines: two run, two wait and the inspector shows Docker's reason.
6. **Bad update**: change the image of the 4-copy service to `nginx:does-not-exist` and apply. The plan reports the failure and the service ends up on the old image.
7. **Binding**: drag from an app's dot to a database's dot (PostgreSQL template with its data pinned); apply; the app receives the connection string and reaches the database over the overlay.
8. **Node failure**: stop Docker on machine 2 (`sudo systemctl stop docker`). Within about 30 seconds the node shows as down and the copies that can move are started on machine 1. Services pinned to machine 2 stay waiting. Start Docker again and the node returns.
9. **Drain**: **Swarm → Nodes → Drain** on machine 2: its copies move to machine 1 and nothing new lands there.
10. **Leaving**: **Swarm → Cluster → Leave** on machine 2's own Nautix, or `docker swarm leave` there. On machine 1, remove the node under **Nodes**.

## No second machine? Two engines on one machine

You can get a real two-node swarm on one Linux machine with two Docker daemons on different loopback addresses. It tests **placement, limits, pinning, drain and node failure** exactly as on two machines. It cannot test the **overlay network** between them (both daemons would create the same VXLAN interface), so leave the services off the overlay.

```
# second daemon
mkdir -p /tmp/d2/data /tmp/d2/exec
sudo dockerd --host unix:///tmp/d2/docker.sock --data-root /tmp/d2/data --exec-root /tmp/d2/exec \
  --pidfile /tmp/d2/docker.pid --containerd-namespace d2 --containerd-plugins-namespace d2p &

docker swarm init --advertise-addr 127.0.0.1 --listen-addr 127.0.0.1:2377
TOKEN=$(docker swarm join-token -q worker)
docker -H unix:///tmp/d2/docker.sock swarm join --token $TOKEN \
  --advertise-addr 127.0.0.2 --listen-addr 127.0.0.2:2377 --data-path-addr 127.0.0.2 127.0.0.1:2377
```

Both nodes report the same hostname; tell them apart by role (manager / worker). Point Nautix at the first daemon as usual.

A full two-machine test of the overlay needs real machines (or two virtual machines): that is the one part nothing else replaces.
