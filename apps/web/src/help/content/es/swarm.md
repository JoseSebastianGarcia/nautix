# Swarm

Docker Swarm convierte una o varias máquinas en un único cluster. En vez de correr contenedores a mano declarás **servicios** ("3 copias de esta imagen") y Swarm los ubica en los nodos, reemplaza los que fallan y reparte el tráfico entre ellos.

## Conceptos

| Término | Significado |
|---|---|
| Nodo | Una máquina del cluster. Los managers deciden; los workers ejecutan tareas |
| Servicio | Lo que querés que corra, con su cantidad de réplicas |
| Tarea | Una copia en ejecución de un servicio |
| Stack | Un grupo de servicios desplegados juntos desde un archivo Compose |
| Red overlay | Una red que abarca los nodos, para que los servicios se alcancen por nombre |
| Secreto / config | Archivos sensibles o comunes entregados a los servicios |

## En Nautix

**Swarm**, en el menú principal (y también como pestaña en **Recursos**), tiene pestañas para servicios, nodos, stacks, secretos, configs y el cluster. Podés crear un swarm en este motor o unirte a uno existente con la dirección del manager y un token, escalar servicios hacia arriba y abajo, y leer el estado y el error de cada tarea.

Mientras no haya un swarm conectado, la Topología muestra un botón flotante **Conectar a Swarm**: inicia un swarm en este motor o se une a uno existente, y una vez conectado la misma página pasa a mostrar el cluster.

- Solo un **manager** puede administrar el cluster. En un worker, Nautix te indica que uses un manager.
- Un puerto publicado por un servicio se abre en **todos los nodos**, en todas las interfaces.
- Eliminar un servicio detiene sus tareas; los volúmenes no se tocan.

## Cuándo usarlo

Swarm vale la pena cuando querés que los servicios sigan corriendo si cae una máquina, o repartir carga entre varias. Para una sola máquina no aporta nada.

## Qué no cubre

Los contenedores creados con `docker run` no son servicios, así que la pestaña Swarm no los muestra. La topología, los vínculos, los documentos de zona y las guardas de puertos trabajan sobre un solo motor Docker a la vez; no siguen a un servicio entre nodos.


## Sumar una segunda máquina

Nautix corre en el manager; las otras máquinas solo necesitan Docker.

1. Abrí solo entre las máquinas: `2377/tcp`, `7946/tcp` y `7946/udp`, `4789/udp` (y el protocolo IP 50 si cifrás un overlay). Nunca a internet: usá una red privada o una VPN.
2. En Nautix iniciá el swarm con la dirección privada del manager como dirección anunciada, y copiá el **token de unión** de worker desde **Swarm, Cluster**.
3. En la otra máquina: `docker swarm join --token <token> <dirección-del-manager>:2377`.

El nodo aparece en **Nodos** y en la leyenda del lienzo. Si una máquina se cae, sus copias se vuelven a iniciar en las otras (salvo las fijadas a ella); **Drenar** las mueve a propósito.

> Los nodos se hablan por los puertos 2377 (tcp), 7946 (tcp y udp) y 4789 (udp). Abrilos solo en una red privada o una VPN, nunca a internet.

Si solo necesitás que dos servidores independientes se hablen, una VPN (WireGuard, Tailscale) entre ellos más un Nautix por servidor es más simple.

Con un swarm activo, la Topología también muestra el cluster completo (servicios, copias y dónde corren) en una vista de solo lectura: mirá [Vista de cluster y redes overlay](help:cluster).
