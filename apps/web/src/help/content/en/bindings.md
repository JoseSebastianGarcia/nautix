# Bindings: connect an app to a service

Two containers on the same network can already talk to each other by name. A binding adds everything around that: it **writes the connection settings the app needs** and applies them safely.

![The app and its database joined by a binding, listed in the inspector](img:bindings)

## Create one

1. In **Topology**, drag from the connection point of the app to the service it uses (a database, a cache, a broker).
2. The dialog shows the plan: the kind of service, the network the app will join, and the variables it will receive (values are masked).
3. Press **Bind**. The app is recreated with the new settings.

## What Nautix does

- **Network**: the app joins a network the service is on. It never uses the default bridge, where names do not resolve.
- **Settings**: it reads user, password, database and port from the service's own environment and builds the app's variables:
  - `.NET connection string`: `ConnectionStrings__Orders=Host=db;Port=5432;...`
  - `URL`: `ORDERS_URL=postgres://user:pass@db:5432/orders`
- **Kinds**: PostgreSQL, MySQL, MariaDB, Redis, MongoDB, SQL Server, RabbitMQ and plain HTTP.
- **Safe apply**: if the recreated app does not become healthy, the previous one is put back and nothing is bound. See [Safe apply](help:safe-apply).

## Later

- **Re-apply** after you change the service's password: the app receives the new value. The binding itself stores no secret.
- **Unbind** removes exactly the variables the binding added and recreates the app. The network it joined stays.
- Every container lists its bindings in the inspector: what it uses and what uses it. Before deleting a database you can see which apps depend on it.

> The service's password is copied into the app's environment, so anyone who can inspect the app can read it. This is the same as setting it by hand.

A binding is also saved in the [zone document](help:zone-spec) as `bindings:`.
