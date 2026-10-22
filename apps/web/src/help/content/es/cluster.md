# Vista de cluster y redes overlay

Cuando este motor forma parte de un swarm, la Topología suma una segunda vista: el **cluster** tal como lo ve su manager. Sin swarm no cambia nada: no hay pestaña nueva ni opción nueva.

El cluster tiene tres dibujos: el **Lienzo**, donde construís, y **Por red** y **Por servidor**, que solo muestran.

## Lienzo: construir servicios sobre redes overlay

![El lienzo: servicios dentro de su overlay, uno por crear (punteado), otro con cambios pendientes, una línea de vínculo y la barra del plan](img:cluster-canvas)

Cada **red overlay** es una caja y cada **servicio** un nodo adentro, con su logo, las copias en ejecución (`3/3`), los puertos publicados, un **punto por copia con el color del servidor donde corre** (hueco si la copia no está bien; la leyenda de arriba lista los servidores) e íconos chicos: **chincheta** (está atado a un nodo o a un rol), **disco** (tiene volúmenes), **llave** (recibe secretos) y **↺** (su última actualización se revirtió). Movés cajas y nodos como en la topología local; las posiciones se guardan. Un servicio en dos overlays se dibuja en la primera y se une a la otra con una línea punteada.

Cada cambio que hacés espera, punteado, en un **plan**; no pasa nada hasta que lo aplicás.

### Crear un servicio

![Crear un servicio desde una plantilla: copias, red, dónde corre, volúmenes, puertos, secretos y entorno](img:cluster-service)

Arrastrá una plantilla a una caja overlay (o hacé clic en ella). Nombre, imagen, copias (o una en cada nodo), red y entorno vienen completados, y elegís:

- **Dónde corre**: cualquier nodo, solo workers, solo managers, o **fijado a un nodo**; más un límite opcional de copias por nodo.
- **Volúmenes**: volúmenes con nombre montados en el contenedor. Una plantilla que pide rutas de datos los trae. **Un volumen vive en el nodo donde corre una copia**: si el servicio puede pasar a otro nodo, la copia que cae ahí arranca con un volumen vacío. Por eso un servicio con volúmenes arranca **fijado a un nodo**, y el diálogo avisa cuando lo dejás libre.
- **Puertos a publicar**: un puerto publicado se abre en todos los nodos, en todas las interfaces. Uno que no publicás igual es alcanzable por los demás servicios de la red.
- **Secretos**: marcá los secretos de Swarm que debe recibir; cada uno aparece dentro del contenedor como el archivo `/run/secrets/<nombre>`. Se crean en **Swarm, Secretos**.

### Cambiar un servicio existente

Seleccionalo: el inspector muestra qué es y qué podés cambiar.

- **Copias**: **− / +**.
- **Imagen**: escribí la nueva y presioná **Aplicar**. Se despliega de a una copia (o deteniendo primero la vieja cuando tiene volúmenes). Si las copias nuevas no arrancan, el motor **vuelve a la imagen anterior por sí mismo**, y el plan lo informa.
- **Mover al overlay**: elegí otro overlay de la lista, o **arrastrá el nodo a otra caja**. Sale del overlay viejo y se une al nuevo.
- **Dónde corre**: cambiá el rol, fijalo a un nodo o limitá las copias por nodo.
- **Volver a la versión anterior**: vuelve a la configuración que tenía antes de su última actualización (imagen, redes, ubicación). Este se hace al instante, después de confirmar.
- **Eliminar del cluster**: el nodo se dibuja tachado. Las eliminaciones se aplican **al final** y no se pueden deshacer: los volúmenes y secretos del servicio quedan, pero su configuración no se puede reconstruir desde acá.

### Vincular dos servicios

Cada nodo tiene un punto chico a cada lado. **Arrastrá del punto de un servicio al de otro** para vincularlos: el primero recibe los datos de conexión del segundo (una cadena de conexión para PostgreSQL, MySQL, SQL Server, MongoDB, Redis, RabbitMQ, o una URL) en su entorno, y llega a él por nombre sobre el overlay que comparten. La vista previa muestra las variables con las contraseñas enmascaradas. El primer servicio se une al overlay del segundo si no estaba. La línea se dibuja con el tipo de servicio; para quitarla, **Desvincular** en el inspector del primero.

### El plan

![Un plan que falla: el servicio no arranca y se deshace todo](img:cluster-plan)

**Revisar y aplicar** lista cada cambio con su comando `docker service` (los valores del entorno nunca se muestran). **Descartar** los quita todos; **Quitar del plan** uno solo.

- **Aplicar** va de a un cambio y espera el resultado: para un servicio nuevo, hasta que sus copias corran; para una actualización, un vínculo o un movimiento, hasta que termine la actualización gradual. Si un cambio falla, **se deshace todo lo que el plan ya hizo**: los servicios creados se eliminan, los escalados o actualizados vuelven a lo que eran, un vínculo se quita y uno que se había quitado se vuelve a poner. El diálogo dice qué falló y por qué.
- Las eliminaciones van al final. Si una falla, las anteriores quedan eliminadas (y el diálogo lo dice); todo lo demás se deshace.
- No se elimina nada que el plan no haya creado o que no hayas pedido eliminar.

![El cluster por red: dos zonas overlay, con servicios, copias y el servidor donde corre cada una](img:cluster-network)

## Cuándo aparece

- **Topología → Servidor local / Cluster** aparece solo cuando este motor está en un swarm.
- Necesita un **manager**. En un worker, o con el swarm bloqueado, la vista dice por qué y te lleva a la pestaña Swarm en vez de mostrar algo incompleto.
- **Por red** y **Por servidor** son de solo lectura. El **Lienzo** arma y cambia servicios mediante un plan.

## Por red

Cada **red overlay** es una caja con línea doble, el nombre, su subred y un candado si está cifrada. Un bus de color recorre la caja y cada servicio cuelga de él.

La tarjeta de un servicio muestra:

| Qué | Significado |
|---|---|
| `3/3` | copias corriendo sobre copias deseadas: verde si están todas, ámbar si faltan, rojo si no corre ninguna |
| `global` | una copia en cada nodo |
| un chip por copia | el servidor donde corre: **●** corriendo, **◌** esperando, **✕** falló (pasá el mouse para ver el error) |
| "N esperando lugar" | copias que el cluster quiere pero todavía no pudo iniciar |
| "Puerto 443 abierto en todos los nodos" | un puerto publicado está abierto en todos los servidores, en todas las interfaces |

Los servicios que no están en ninguna red overlay van a una caja propia al final.

## Por servidor

![El mismo cluster por servidor: qué corre en cada nodo](img:cluster-server)

Una columna por servidor, los managers primero. Adentro están las tareas que corren ahí, con las redes en las que están como etiquetas de color (la leyenda va arriba). Un servidor que no responde se dibuja en rojo: el cluster ya recreó sus tareas en otro lado.

## El panel de nodos y el inspector

- **Nodos**: rol, dirección, disponibilidad (activo, en pausa, drenando), líder y cuántas tareas tiene cada uno. Hacé clic en uno para resaltar sus tareas en el dibujo.
- Aparece un aviso cuando hay menos de **tres managers**: con uno o dos, perder un manager deja al cluster sin poder decidir.
- **Inspector**: el modo del servicio, las copias corriendo, sus redes y una tabla de sus tareas con el servidor y el error de las que fallaron.

## Redes overlay

![Nueva red, con la opción overlay](img:cluster-overlay)

**Nueva red** muestra la elección **Local** u **Overlay** solo cuando el motor está en un swarm.

- Una red **overlay** abarca todos los servidores del swarm: los servicios se encuentran por nombre estén donde estén.
- **Cifrar el tráfico entre servidores** viene marcado. Docker lo deja apagado por defecto, y entonces el tráfico entre servidores viaja sin cifrar.
- **Attachable** permite unir también contenedores sueltos (`docker run`), no solo servicios.
- En un **worker**, o con el swarm **bloqueado**, la opción está deshabilitada y dice por qué. Si lo intentás igual por la API, la respuesta es la misma: una overlay necesita un manager de swarm.

En la topología local una red overlay también se dibuja con línea doble.

## Salir del swarm

![Salir del swarm lista lo que se ve afectado](img:cluster-leave)

El diálogo lista las **zonas overlay** que quedan sin cluster y los **servicios** que se detienen en este nodo. Los volúmenes no se tocan y los contenedores sueltos siguen corriendo. Si es el **último manager**, salir disuelve el cluster y el diálogo lo dice.

## Lo que no muestra

- **Contenedores sueltos** de otros servidores: un manager solo conoce los servicios. Para verlos Nautix necesita una conexión al Docker de ese servidor.
- **Imágenes y volúmenes** de los otros nodos.
- **Quién habla con quién.** Docker dice qué servicios pertenecen a una red, no el tráfico entre ellos. Las líneas son pertenencia, no conversaciones.
- **Dos swarms** son dos clusters separados: una red nunca abarca a ambos.

Mirá también [Swarm](help:swarm) y [Topología y zonas](help:topology).
