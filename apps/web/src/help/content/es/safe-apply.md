# Aplicar con seguridad y rollback

Docker no puede cambiar el entorno, los puertos publicados ni las redes de un contenedor en marcha. Para aplicar esos cambios Nautix **recrea** el contenedor con la misma configuración más tu cambio. Como eso puede fallar, lo hace de una forma que siempre permite volver atrás.

## Cómo funciona

1. El contenedor viejo se detiene y se aparta con un nombre temporal.
2. Se crea e inicia el nuevo.
3. **Control de salud**: el nuevo debe demostrar que funciona.
   - Si la imagen tiene `HEALTHCHECK`, debe quedar `healthy` antes del límite de tiempo.
   - Si no, debe seguir corriendo, sin reiniciarse, durante unos segundos.
4. Si pasa, se elimina el contenedor apartado. Si falla, o algo sale mal, se elimina el nuevo, el viejo recupera su nombre y vuelve a iniciar.

Un contenedor que estaba detenido se recrea detenido, sin el control.

## Qué ves

Un diálogo que recrea un contenedor lo avisa antes de confirmar. Al aplicar obtenés uno de dos resultados:

- **Aplicado.**
- **Revertido**, con el motivo y las últimas líneas de log del contenedor que falló. El anterior vuelve a correr, con los mismos datos.

![Un cambio revertido con su motivo](img:apply-failure)

## Dónde se usa

Cambiar la exposición de un puerto, editar el entorno, crear o quitar un [vínculo](help:bindings) y aplicar un [documento de zona](help:zone-spec).

## Qué se conserva

Nombre, imagen, comando, entorno, montajes (incluidos los volúmenes anónimos), redes y política de reinicio. Nautix no puede recrearse a sí mismo desde su propia interfaz.

> Los volúmenes no se tocan al recrear. Los datos que contienen siguen ahí.
