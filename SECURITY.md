# Política de seguridad

## Datos y privacidad

AUVASA es una skill de Alexa que **no recopila datos personales**. La única
información que se guarda es la **parada favorita** del usuario, y se almacena
en la cuenta de Alexa del propio usuario (DynamoDB gestionada por Amazon), no en
servidores del proyecto.

El proyecto **no incluye credenciales**: `.env` está en `.gitignore` y el
repositorio no contiene claves, tokens ni contraseñas. Si encuentras algún
secreto por error, avísanos cuanto antes (ver más abajo).

## Cómo informar de un problema de seguridad

Si crees que has encontrado una vulnerabilidad, **no abras un issue público**
(evitarías exponer el problema antes de tiempo). Escribe un correo a:

> `diegovsj@hotmail.com`

Indica, si puedes:

1. Una descripción del problema y su impacto.
2. Los pasos para reproducirlo.
3. Una posible solución, si la conoces.

Se intentará responder lo antes posible y, si procede, se publicará una
corrección y un aviso en el [`CHANGELOG.md`](CHANGELOG.md).

## Alcance

Entran dentro del alcance el código de la Lambda (`lambda/`) y las herramientas
de desarrollo (`tools/`). No entran los servicios de Amazon (Alexa, Lambda,
DynamoDB) ni el portal de datos de AUVASA, que deben reportarse a sus
responsables.
