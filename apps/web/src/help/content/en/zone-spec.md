# Zone document

One YAML document per zone says what should be there: the services, how they are exposed and what they are bound to. Nautix reads it from what is running, shows you the **plan** of what would change and applies it safely.

![The zone document with its plan](img:zone-spec)

Open it from a box in the topology with **Edit as document**.

## Example

```yaml
version: 1
zone:
  name: shop
  internal: false
services:
  db:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: change-me
      POSTGRES_DB: orders
    volumes: ["db-data:/var/lib/postgresql/data"]
    restart: unless-stopped
  api:
    image: myorg/orders-api:1.4
    ports:
      - { container: 8080, host: 8080, expose: local }
    bindings:
      - { to: db, name: Orders, style: dotnet }
```

- `expose` is `local` (default), `open` or an IP address of this machine.
- `bindings` live on the app that uses a service. The variables they produce are not written in `env`.
- An unknown key is an error, so a typo is never ignored silently.

## Plan and apply

| Action | When |
|---|---|
| Create network or service | missing |
| Update | image, command, environment, restart policy or port exposure changed: recreated with [rollback](help:safe-apply) |
| Replace | volumes or the set of published ports changed: removed and created again |
| Remove | only if you tick the removal box; otherwise reported and left alone |
| Bind / unbind | bindings changed |

Press **Plan** to see the actions, then **Apply plan**. If something changed while you were reading, the plan hash no longer matches and nothing runs: review the new plan. The first failure stops the run and the result shows what was done, what failed and what was skipped.

## Drift

The last applied document is kept. When the running zone stops matching it (someone used the Docker CLI, or a change failed halfway) the box shows a **drift** badge and the plan shows the difference.

> Environment values appear in clear text, as they are in the containers. Only admins can open this page.
