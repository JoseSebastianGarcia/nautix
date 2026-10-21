# Vínculos: conectar una app con un servicio

Dos contenedores en la misma red ya pueden hablarse por nombre. Un vínculo agrega todo lo que rodea a eso: **escribe los datos de conexión que la app necesita** y los aplica de forma segura.

![La app y su base de datos unidas por un vínculo, listado en el inspector](img:bindings)

## Crear uno

1. En **Topología**, arrastrá desde el punto de conexión de la app hasta el servicio que usa (una base de datos, un caché, un broker).
2. El diálogo muestra el plan: el tipo de servicio, la red a la que se unirá la app y las variables que recibirá (los valores van enmascarados).
3. Presioná **Vincular**. La app se recrea con los nuevos datos.

## Qué hace Nautix

- **Red**: la app se une a una red donde está el servicio. Nunca usa el bridge por defecto, donde los nombres no se resuelven.
- **Datos de conexión**: lee usuario, contraseña, base y puerto del entorno del propio servicio y arma las variables de la app:
  - `Cadena de conexión .NET`: `ConnectionStrings__Orders=Host=db;Port=5432;...`
  - `URL`: `ORDERS_URL=postgres://user:pass@db:5432/orders`
- **Tipos**: PostgreSQL, MySQL, MariaDB, Redis, MongoDB, SQL Server, RabbitMQ y HTTP simple.
- **Aplicación segura**: si la app recreada no queda sana, vuelve la anterior y no se guarda ningún vínculo. Mirá [Aplicar con seguridad](help:safe-apply).

## Después

- **Reaplicar** cuando cambiás la contraseña del servicio: la app recibe el valor nuevo. El vínculo no guarda ningún secreto.
- **Desvincular** quita exactamente las variables que agregó el vínculo y recrea la app. La red a la que se unió se mantiene.
- Cada contenedor lista sus vínculos en el inspector: qué usa y quién lo usa. Antes de borrar una base de datos ves qué apps dependen de ella.

> La contraseña del servicio se copia al entorno de la app, así que cualquiera que pueda inspeccionar la app la puede leer. Es lo mismo que pasaría configurándola a mano.

Un vínculo también queda en el [documento de zona](help:zone-spec) como `bindings:`.
