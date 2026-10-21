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

**Recursos, Swarm** tiene pestañas para servicios, nodos, stacks, secretos, configs y el cluster. Podés crear un swarm en este motor o unirte a uno existente con la dirección del manager y un token, escalar servicios hacia arriba y abajo, y leer el estado y el error de cada tarea.

- Solo un **manager** puede administrar el cluster. En un worker, Nautix te indica que uses un manager.
- Un puerto publicado por un servicio se abre en **todos los nodos**, en todas las interfaces.
- Eliminar un servicio detiene sus tareas; los volúmenes no se tocan.

## Cuándo usarlo

Swarm vale la pena cuando querés que los servicios sigan corriendo si cae una máquina, o repartir carga entre varias. Para una sola máquina no aporta nada.

## Qué no cubre

Los contenedores creados con `docker run` no son servicios, así que la pestaña Swarm no los muestra. La topología, los vínculos, los documentos de zona y las guardas de puertos trabajan sobre un solo motor Docker a la vez; no siguen a un servicio entre nodos.

> Los nodos se hablan por los puertos 2377 (tcp), 7946 (tcp y udp) y 4789 (udp). Abrilos solo en una red privada o una VPN, nunca a internet.

Si solo necesitás que dos servidores independientes se hablen, una VPN (WireGuard, Tailscale) entre ellos más un Nautix por servidor es más simple.
