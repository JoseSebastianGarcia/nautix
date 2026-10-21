# Safe apply and rollback

Docker cannot change the environment, published ports or networks of a running container. To apply those changes Nautix **recreates** the container with the same settings plus your change. Because that can fail, it does it in a way that always lets you go back.

## How it works

1. The old container is stopped and parked under a temporary name.
2. The new one is created and started.
3. **Health gate**: the new container must prove it works.
   - If the image has a `HEALTHCHECK`, it must become `healthy` before the time limit.
   - If not, it must stay running, without restarting, for a few seconds.
4. If it passes, the parked container is removed. If it fails, or anything goes wrong, the new one is removed, the old one gets its name back and starts again.

A container that was stopped is recreated stopped, without the gate.

## What you see

A dialog that recreates a container says so before you confirm. After applying you get one of two results:

- **Applied.**
- **Rolled back**, with the reason and the last log lines of the container that failed. The previous container is running again, with the same data.

![A change rolled back with the reason](img:apply-failure)

## Where it is used

Changing the exposure of a port, editing the environment, creating or removing a [binding](help:bindings) and applying a [zone document](help:zone-spec).

## What is kept

Name, image, command, environment, mounts (including anonymous volumes), networks and restart policy. Nautix itself cannot be recreated from its own interface.

> Volumes are not touched by a recreate. Data in them is still there afterwards.
