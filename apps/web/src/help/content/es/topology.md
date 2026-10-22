# Topología y zonas

La topología es la máquina dibujada como un diagrama. Cada **caja** es una red de Docker (una zona); los **nodos** adentro son los contenedores que comparten esa red. Los contenedores de una misma caja se alcanzan entre sí por nombre.

![La topología con dos redes y sus contenedores](img:topology)

## Qué podés hacer

- **Desplegar**: arrastrá desde la paleta a una caja. Si lo soltás en el lienzo vacío, el servicio queda externo (sin red compartida) y sus puertos se publican solo en `127.0.0.1`.
- **Mover** un contenedor a otra caja: deja su red y se une a la nueva después de que confirmes.
- **Unirlo a una segunda red**: un contenedor en dos redes las conecta. Sirve para un proxy inverso que debe llegar a servicios aislados.
- **Las redes aisladas** no tienen salida al exterior: sus contenedores no llegan a internet ni se puede llegar a ellos desde afuera.
- **Inspeccionar**: hacé clic en un nodo o una caja para ver detalles, puertos, entorno, logs y acciones en el inspector.
- **Ordenar** vuelve a acomodar todo; las posiciones que fijaste a mano se guardan.
- **Exportar Compose** escribe los contenedores visibles como un archivo Compose.

## Insignias de puertos

Cada puerto publicado muestra quién puede llegar a él:

| Insignia | Significado |
|---|---|
| solo local | publicado en `127.0.0.1` |
| una dirección | publicado en una dirección de esta máquina (LAN o VPN) |
| abierto | publicado en todas las interfaces: cualquiera que llegue a esta máquina llega al puerto |

Se cambia desde la página del contenedor. Para restringir quién puede conectarse, mirá [Guardas de puertos](help:guards).

## Vista de cluster

Si este motor está en un swarm, aparece un selector **Servidor local / Cluster** sobre el diagrama. La vista de cluster dibuja los servicios del swarm y dónde corren sus copias; mirá [Vista de cluster y redes overlay](help:cluster). Sin swarm el selector no existe.

## Líneas entre contenedores

Una línea sólida con etiqueta es un [vínculo](help:bindings): un contenedor usa a otro y Nautix configuró la conexión.

## Una zona como documento

Seleccioná una caja y presioná **Editar como documento** para ver toda la zona como un único YAML. Mirá [Documento de zona](help:zone-spec). Una insignia de **desvío** en una caja indica que lo que corre ya no coincide con el último documento que aplicaste.
