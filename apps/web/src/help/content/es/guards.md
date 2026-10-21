# Guardas de puertos

A un puerto publicado llega lo que pueda enrutar hasta la dirección en la que está publicado. Las guardas te dejan decidir quién es ese. Hay tres niveles; cada uno funciona por separado.

## 1. Exposición

La dirección en la que se publica un puerto.

| Exposición | Publicado en | Quién puede conectarse |
|---|---|---|
| Solo esta máquina | `127.0.0.1` | esta máquina |
| Una dirección | una dirección del host, como su IP de LAN o VPN | quien llegue a esa dirección |
| Todos | `0.0.0.0` | cualquiera que llegue a esta máquina |

Se cambia desde la página del contenedor. Docker no puede volver a enlazar un puerto en marcha, así que el contenedor se recrea; si el nuevo falla, se repone el anterior ([aplicación segura](help:safe-apply)). **Sistema, Exposición** lista todos los puertos publicados, los abiertos primero.

## 2. Filtros de gateway

Una ruta de un gateway (Kong, nginx, Caddy, Traefik o HAProxy) puede tener una lista de **orígenes permitidos**. Todos los demás reciben `403`. El editor de rutas te sugiere tu propia dirección y te avisa si la lista te dejaría afuera. Detrás de otro proxy, la dirección del cliente sale de `X-Forwarded-For`.

## 3. Firewall del host

Para cualquier protocolo, no solo HTTP. Las reglas dicen qué redes (como `10.0.0.0/24`) pueden llegar a un puerto publicado; todos los demás son descartados por el firewall del host (iptables o nftables).

![Reglas de guarda y estado del ayudante](img:guards)

Nautix se mantiene sin privilegios, así que las reglas las aplica un **ayudante**: un pequeño contenedor aparte con red del host y la capacidad `NET_ADMIN`. No guarda datos y no abre ningún puerto: le pide las reglas a Nautix y las aplica. Creá su token en **Recursos, Guardas** y ejecutá el comando que se muestra.

- **Ventana de prueba**: las reglas nuevas se aplican por 60 segundos. Presioná **Conservar estas reglas** o se revierten solas, incluso si perdés el acceso.
- **Control de bloqueo**: una regla que cortaría tu propia dirección, o que protege a Nautix mismo, pide una confirmación explícita.
- **Desactivar todas las guardas** quita todas las reglas. En el host, el interruptor de emergencia es `docker exec nautix-guard node dist/guard-helper.js --panic`.

> Solo Linux. Con Docker Desktop o Docker rootless el ayudante no alcanza el firewall del host.
