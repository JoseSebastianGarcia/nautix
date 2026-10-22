# Vista de cluster y redes overlay

Cuando este motor forma parte de un swarm, la Topología suma una segunda vista: el **cluster** tal como lo ve su manager. Sin swarm no cambia nada: no hay pestaña nueva ni opción nueva.

![El cluster por red: dos zonas overlay, con servicios, copias y el servidor donde corre cada una](img:cluster-network)

## Cuándo aparece

- **Topología → Servidor local / Cluster** aparece solo cuando este motor está en un swarm.
- Necesita un **manager**. En un worker, o con el swarm bloqueado, la vista dice por qué y te lleva a la pestaña Swarm en vez de mostrar algo incompleto.
- Es de **solo lectura**. Para crear o cambiar servicios usá la pestaña Swarm; el inspector tiene un botón que te lleva ahí.

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
