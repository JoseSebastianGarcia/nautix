# Audit log

Nautix keeps a trail of who changed what. Admins read it in **Settings, Audit log**, and in the **History** tab of each container.

![The history of a container: environment changes, a binding and a read of its settings](img:audit)

## What each entry says

Every change records the time, who made it (a person or an API token), the request and its result, and a line that says **what was touched**:

| Change | Detail |
|---|---|
| Environment of a container | `env container=api set=LOG_LEVEL,API_KEY unset=OLD_FLAG` |
| Published ports | `exposure container=web 80/tcp=open` |
| Bindings | `binding create consumer=api provider=db name=Orders style=dotnet` |
| Zone document | `zone apply zone=shop done=2 failed=1 skipped=0 …` with the action that failed |
| Port guards | `guard rules count=2 web:80/tcp<-10.0.0.0/24 …`, and when they are confirmed or disabled |

A change that was rolled back appears too, with its error result, so you can see an attempt even when nothing changed.

> **Values are never recorded.** The trail names variables, ports and rules, but not what is inside them. A password in the log would be one more place where it can be read.

## Reads are recorded too

Opening a container's settings or a zone document shows environment values in clear text, so Nautix leaves an entry: `read env container=api` or `read zone=shop`. The same person reading the same thing again within ten minutes is not repeated, so the log stays readable. Read-only users never see those values and are not recorded.

## Finding things

- The search box in **Settings** filters by text in the action or the detail: a container name, `exposure`, `binding`, a variable name.
- The **History** tab of a container shows what touched it: its environment, ports, and the bindings where it is the app or the service.
- Plans and previews change nothing and are not recorded.

The log keeps the latest 20,000 entries. It is part of the backup.
