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

## Carpetas montadas y montajes riesgosos
El diálogo de despliegue y el editor de templates tienen una lista **Carpetas montadas**: una carpeta de esta máquina (`/srv/data`) conectada con una carpeta dentro del contenedor (`/data`), opcionalmente de **solo lectura**. Usá rutas absolutas. Algunos montajes son riesgosos y nunca pasan en silencio: el **socket de Docker** (es root en el servidor), el **disco completo** (`/`) y las **carpetas del sistema** (`/etc`, `/root`, `/boot`, `/proc`, `/sys`, `/dev` y los datos propios de Docker). Cuando un montaje es de esos, un aviso rojo explica qué permite y **Desplegar** queda deshabilitado hasta que marques que lo aceptás. El servidor aplica la misma regla, así que un script o un token de API no puede saltearla.

## Eliminar escribiendo el nombre
Eliminar un contenedor, imagen, volumen, red, proyecto de Compose, servicio de swarm, stack, nodo, usuario, login guardado o plugin te pide **escribir su nombre exacto** antes de que se habilite el botón rojo *Eliminar*, como hace GitHub antes de borrar un repositorio. Importan las mayúsculas. Cancelar o cerrar el diálogo borra lo que escribiste.

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

## Paneles y atajos

Hacé clic en un lugar vacío del lienzo para esconder la paleta y el inspector y ver solo el dibujo. Al seleccionar algo vuelve el inspector; la pestaña de cada borde muestra u oculta un panel a mano.

Con algo seleccionado: **Ctrl+Supr** pide confirmación para borrarlo, **Ctrl+I** lo inicia y **Ctrl+.** lo detiene (Ctrl+Esc también, donde el sistema no lo reserva, como Windows). Los atajos no actúan mientras escribís ni con un diálogo abierto. En el lienzo de Swarm, parar e iniciar planifican cero o una copia y borrar planifica la baja, así que no pasa nada hasta que apliques el plan.
