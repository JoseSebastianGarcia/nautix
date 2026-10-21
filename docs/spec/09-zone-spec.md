# 09 — Zone spec

One document per zone (a network box in the topology) that says what should be there: the services, how they are exposed, and what they are bound to. Nautix can **read** it from what is running, **plan** the difference between it and reality, and **apply** the plan safely. It is the shared artifact for the visual editors today and for AI proposals later: whoever edits it, a human or a model, produces text that is validated, shown as a plan and only then applied.

Chain: **spec → plan → apply → verify → drift.**

**Non-goals (this version).** Multiple hosts, a new language users must learn (the format is plain YAML close to Compose), secrets management (see "Secrets"), Compose/Kubernetes import, DNS records, gateway routes and guard rules inside the spec (planned as further sections, see the end).

---

## The document

```yaml
version: 1
zone:
  name: shop            # the network; created when missing
  internal: false       # no route to the outside
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
      - { container: 8080, host: 8080, expose: local }   # local | open | <ip address>
    env: { ASPNETCORE_ENVIRONMENT: Production }
    bindings:
      - { to: db, name: Orders, style: dotnet }          # ConnectionStrings__Orders
```

- A service name is the container name (unique on the engine); it is also the name other services use to reach it.
- `ports[].expose` defaults to `local` (127.0.0.1). `open` is every interface; an IP address binds that address.
- `bindings` live on the consumer, exactly as in bindings (ADR-043); the variables they produce are **not** written in `env`.
- Unknown keys are an error, so a typo is never silently ignored.
- Everything is validated with the same schemas the API already uses (`ResourceName`, ports, `isIpAddress`, restart policy).

## Reading the zone: `describeZone`

Builds the document from what is running: the containers on the network (Nautix itself and tunnels are left out), their explicitly configured environment, command, restart policy, volumes and published ports with their real host address, and the stored bindings. Variables a binding wrote are removed from `env` and shown as the binding, so describing and re-applying changes nothing.

## Plan: `planZone(desired, actual)`

Pure. Returns an ordered list of actions and warnings; applying an empty plan does nothing, and a plan after a successful apply is empty.

| Action | When | How it runs |
|---|---|---|
| `create-network` | the zone does not exist | create the network |
| `create-service` | service missing | pull, create, start, join the network |
| `update-service` (`fields`) | environment, command, image, restart policy, port exposure differ | recreate through safe apply (restart policy is updated in place) |
| `replace-service` | volumes or the set of published ports differ | remove and create again; **warns** that anonymous volumes are lost |
| `remove-service` | a container is on the zone but not in the spec | only when the apply explicitly allows removals; otherwise reported as `extra` and left alone |
| `add-binding` / `remove-binding` | bindings differ | as bindings do, after the services exist |

Order: network, creates, updates and replaces (providers before their consumers), bindings, removals last. A name that already belongs to a container outside the zone is an error, not an action.

Warnings never block, errors do: invalid spec, name taken elsewhere, binding to a missing service, a binding cycle between two services is allowed.

## Apply

`POST /zones/:name/apply` takes the document and a `planHash` (the hash of the plan the user saw). If reality changed in between, the hash differs and nothing runs ("the zone changed, review the new plan"). Actions run one by one; the first failure stops the run and the result lists what was done, what failed (with the rollback reason from safe apply) and what was skipped. Removals need `allowRemovals: true`. The applied document is stored as the zone's **desired spec**.

## Drift

The stored desired spec is compared with reality (`planZone(stored, describeZone(...))`). A zone with a non-empty plan shows a **drift** badge on its box and the plan in its Spec tab: the difference between what was declared and what is running (someone changed something with the Docker CLI, or a change failed half way).

## Secrets

Environment values of the services are in the document in clear text, as they are in the containers. The document is only available to admins, is never written to logs, and the audit trail records only that it was read (`read zone=…`) and, for an apply, which actions ran (names of services and fields, not values), and the editor says so. A reference syntax pointing to a vault is the next step, not part of this version.

## UI

Selecting a zone in the topology opens its inspector with a **Spec** button: a YAML editor (the same component as the Compose editor) preloaded with the current description or the stored desired spec, a **Plan** button that lists the actions with icons and warnings, and **Apply** (with a checkbox for removals). Results show per action, with the rollback reason when one failed.

## Acceptance

- Unit: schema (valid, unknown keys, bad ports, bad names), `describeZone` (round trip with bindings; derived variables hidden), `planZone` (every action kind, ordering, no-op on an equal spec, name clash, warnings), plan hash stable and sensitive to changes.
- e2e (fake engine): describe → edit → plan → apply → plan is empty; changed reality invalidates the hash; removals refused without the flag; failure stops and reports; drift reported.
- Real daemon: a zone with a database and an app bound to it is created from a document alone and works (the app reaches the database with the generated settings); changing an environment value in the document recreates only that service; the second apply is a no-op.

## Order of work

1. Contracts: schema, YAML, describe, plan, hash (pure, tested).
2. Engine: `ContainerChange` gains `image`, `command`; apply orchestration, store for the desired spec, API.
3. UI: Spec editor and plan view; drift badge.
4. Later sections: `dns`, `routes`, `guards`, `checks` (acceptance checks that give an honest progress percentage), and the AI that proposes a diff of the document.
