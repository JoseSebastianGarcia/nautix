# Registro de auditoría

Nautix guarda quién cambió qué. Los admins lo leen en **Ajustes, Registro de auditoría** y en la pestaña **Historial** de cada contenedor.

![El historial de un contenedor: cambios de entorno, un vínculo y una lectura de sus ajustes](img:audit)

## Qué dice cada entrada

Cada cambio registra la hora, quién lo hizo (una persona o un token de API), la solicitud y su resultado, y una línea que dice **qué se tocó**:

| Cambio | Detalle |
|---|---|
| Entorno de un contenedor | `env container=api set=LOG_LEVEL,API_KEY unset=OLD_FLAG` |
| Puertos publicados | `exposure container=web 80/tcp=open` |
| Vínculos | `binding create consumer=api provider=db name=Orders style=dotnet` |
| Documento de zona | `zone apply zone=shop done=2 failed=1 skipped=0 …` con la acción que falló |
| Guardas de puertos | `guard rules count=2 web:80/tcp<-10.0.0.0/24 …`, y cuando se confirman o se desactivan |

Un cambio que se revirtió también aparece, con su resultado de error, así que ves el intento aunque no haya cambiado nada.

> **Los valores nunca se registran.** El registro nombra variables, puertos y reglas, pero no lo que contienen. Una contraseña en el registro sería un lugar más donde se puede leer.

## Las lecturas también se registran

Abrir los ajustes de un contenedor o un documento de zona muestra los valores del entorno en texto claro, así que Nautix deja una entrada: `read env container=api` o `read zone=shop`. Si la misma persona vuelve a leer lo mismo dentro de diez minutos no se repite, para que el registro siga siendo legible. Los usuarios de solo lectura no ven esos valores y no se registran.

## Cómo encontrar cosas

- El buscador de **Ajustes** filtra por texto en la acción o el detalle: un nombre de contenedor, `exposure`, `binding`, el nombre de una variable.
- La pestaña **Historial** de un contenedor muestra lo que lo tocó: su entorno, sus puertos y los vínculos donde es la app o el servicio.
- Los planes y las vistas previas no cambian nada y no se registran.

El registro conserva las últimas 20.000 entradas. Forma parte del backup.
