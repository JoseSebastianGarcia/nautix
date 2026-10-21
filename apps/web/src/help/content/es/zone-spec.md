# Documento de zona

Un documento YAML por zona dice qué debería haber: los servicios, cómo se exponen y a qué están vinculados. Nautix lo lee de lo que está corriendo, te muestra el **plan** de lo que cambiaría y lo aplica de forma segura.

![El documento de zona con su plan](img:zone-spec)

Se abre desde una caja de la topología con **Editar como documento**.

## Ejemplo

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

- `expose` es `local` (por defecto), `open` o una dirección IP de esta máquina.
- `bindings` van en la app que usa un servicio. Las variables que producen no se escriben en `env`.
- Una clave desconocida es un error, así un error de tipeo nunca se ignora en silencio.

## Plan y aplicación

| Acción | Cuándo |
|---|---|
| Crear red o servicio | no existe |
| Actualizar | cambió imagen, comando, entorno, política de reinicio o exposición de puertos: se recrea con [rollback](help:safe-apply) |
| Reemplazar | cambiaron los volúmenes o el conjunto de puertos publicados: se elimina y se crea de nuevo |
| Eliminar | solo si marcás la casilla de eliminación; si no, se informa y se deja |
| Vincular / desvincular | cambiaron los vínculos |

Presioná **Plan** para ver las acciones y después **Aplicar plan**. Si algo cambió mientras leías, el hash del plan ya no coincide y no se ejecuta nada: revisá el plan nuevo. El primer fallo detiene la ejecución y el resultado muestra qué se hizo, qué falló y qué se omitió.

## Desvío

Se guarda el último documento aplicado. Cuando la zona en marcha deja de coincidir (alguien usó la CLI de Docker, o un cambio falló a medias) la caja muestra una insignia de **desvío** y el plan muestra la diferencia.

> Los valores de entorno aparecen en texto claro, igual que en los contenedores. Solo los admins pueden abrir esta página.
