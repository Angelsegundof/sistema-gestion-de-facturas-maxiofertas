# PRD — Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Product Requirements Document (PRD)  
**Versión:** 1.1 — Consolidada  
**Estado:** Propuesta consolidada para revisión y aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Business Analyst / Product Manager  
**Implementación prevista:** Antigravity  
**Organización:** Maxiofertas  

---

## Control de versión

| Versión | Fecha | Descripción |
|---|---|---|
| 1.0 | 19-08-2026 | PRD inicial del Sistema de Gestión de Facturas Maxiofertas. |
| 1.1 | 19-08-2026 | Consolidación de reglas de precios IVA incluido, cálculo de netos para SII, cuadratura, rectificación de facturas, Notas de Crédito, trazabilidad e impacto estadístico. |

### Autoridad documental

Este documento sustituye funcionalmente al PRD v1.0 y a la actualización separada v1.1.  
Las reglas incorporadas en la v1.1 prevalecen sobre cualquier definición anterior incompatible.

---

# 1. Resumen ejecutivo

Maxiofertas gestiona actualmente las solicitudes de facturación mediante un formulario de Google Forms cuyas respuestas son almacenadas y procesadas en una hoja de Google Sheets.

El mecanismo actual permite ejecutar la operación, pero presenta problemas de escalabilidad, concurrencia, trazabilidad, calidad de datos y eficiencia operacional.

Entre los principales problemas identificados se encuentran:

- Solicitudes duplicadas.
- Uso simultáneo de una misma hoja por varios ejecutores.
- Aplicación accidental de filtros globales que ocultan solicitudes a otros usuarios.
- Falta de asignación formal de solicitudes.
- Estados escritos manualmente y sin normalización.
- Datos incompletos o incorrectos.
- Seguimiento manual de observaciones.
- Proceso lento para almacenar y compartir la factura generada.
- Carga manual de documentos en Google Drive.
- Gestión manual de permisos.
- Generación manual de enlaces.
- Creación y copia manual del mensaje de WhatsApp.
- Ausencia de estadísticas de facturación consolidadas.
- Falta de trazabilidad completa sobre quién realizó cada acción.

El proyecto **Sistema de Gestión de Facturas Maxiofertas** tiene como objetivo sustituir progresivamente este flujo por una aplicación web propia, integrada al Hub Maxiofertas, con base de datos independiente y un flujo de trabajo diseñado específicamente para la operación de facturación.

El sistema gestionará el ciclo desde la solicitud realizada por una bodega hasta la entrega de la factura al cliente.

La emisión tributaria seguirá realizándose inicialmente mediante el sistema del Servicio de Impuestos Internos de Chile u otro mecanismo tributario utilizado por la empresa.

El sistema no emitirá DTE directamente en su primera versión.

Además, la versión 1.1 establece como reglas críticas que:

1. el solicitante trabaja exclusivamente con precios IVA incluido;
2. el sistema calcula automáticamente los valores netos requeridos por el ejecutor para el SII;
3. una factura ya emitida no puede editarse directamente, pero puede iniciar un proceso formal de rectificación mediante Nota de Crédito y nueva factura.

---

# 2. Problema de negocio

## 2.1 Situación actual

Las bodegas solicitan facturas mediante Google Forms.

Cada solicitud genera una fila en una hoja compartida de Google Sheets.

Los responsables de facturación utilizan la misma hoja para:

- revisar solicitudes;
- identificar pendientes;
- detectar solicitudes duplicadas;
- verificar datos;
- generar facturas;
- registrar observaciones;
- pegar enlaces de documentos;
- marcar facturas realizadas;
- generar o copiar mensajes para el cliente.

Este modelo utiliza una hoja de cálculo como:

- formulario operacional;
- base de datos;
- sistema de workflow;
- panel de tareas;
- mecanismo de auditoría;
- repositorio de enlaces;
- herramienta de coordinación entre personas.

Esta combinación genera errores frecuentes y una dependencia importante del conocimiento informal de los usuarios.

---

# 3. Objetivo del producto

Crear un sistema centralizado de gestión de solicitudes de facturación que permita:

1. Recibir solicitudes de factura desde las bodegas.
2. Validar la información antes de crear una solicitud.
3. Detectar posibles solicitudes duplicadas.
4. Gestionar solicitudes mediante una cola priorizada.
5. Evitar que dos ejecutores procesen simultáneamente la misma solicitud.
6. Gestionar observaciones y correcciones.
7. Registrar la factura generada.
8. Almacenar el documento asociado.
9. Generar automáticamente el mensaje destinado al cliente.
10. Facilitar el envío mediante WhatsApp.
11. Mantener historial y trazabilidad de toda la operación.
12. Generar estadísticas administrativas y financieras.
13. Integrarse al Hub Maxiofertas.
14. Reducir significativamente el trabajo manual.
15. Mantener costos de infraestructura bajos o dentro de cuotas gratuitas cuando sea razonablemente posible.
16. Asegurar que el solicitante opere únicamente con precios finales IVA incluido.
17. Calcular automáticamente los valores netos requeridos para el ingreso de productos en el SII.
18. Comprobar que el total con IVA generado por el SII coincide con el total solicitado.
19. Gestionar rectificaciones de facturas emitidas conservando toda la cadena documental.
20. Registrar Notas de Crédito asociadas y excluir correctamente de las estadísticas las facturas completamente anuladas.

---

# 4. Visión del producto

El producto deberá funcionar como una **mesa de trabajo especializada en solicitudes de facturación**.

No pretende convertirse inicialmente en:

- ERP;
- software contable;
- sistema tributario;
- reemplazo del SII;
- sistema de emisión electrónica de DTE.

Su propósito es resolver específicamente la gestión operacional alrededor de la emisión de facturas.

El flujo conceptual principal será:

```text
Bodega
  ↓
Solicitud
  ↓
Validación
  ↓
Detección de duplicados
  ↓
Cola de facturación
  ↓
Asignación
  ↓
Emisión externa de factura
  ↓
Validación de total SII
  ↓
Carga del documento
  ↓
Cierre de solicitud
  ↓
Mensaje al cliente
  ↓
Historial y estadísticas
```

Cuando una factura ya realizada requiera corrección:

```text
Factura realizada
  ↓
Solicitar cambio
  ↓
Rectificación
  ↓
Nota de Crédito
  ↓
Nueva factura
  ↓
Historial y estadísticas
```

---

# 5. Usuarios del sistema

## 5.1 Solicitante / Encargado de bodega

Usuario responsable de solicitar facturas.

Podrá:

- crear solicitudes;
- consultar sus solicitudes;
- visualizar estados;
- corregir solicitudes observadas;
- consultar facturas realizadas;
- acceder al documento final cuando corresponda;
- solicitar cambios sobre facturas ya realizadas;
- consultar el estado de una rectificación.

El solicitante **no trabajará con precios netos ni cálculos tributarios**. Todos los precios que ingrese serán valores finales con IVA incluido.

## 5.2 Ejecutor de facturación

Usuario responsable de gestionar y emitir facturas.

Podrá:

- consultar la cola general;
- tomar una solicitud;
- revisar datos;
- observar solicitudes;
- devolver solicitudes para corrección;
- visualizar precio con IVA y precio neto calculado;
- copiar el precio neto para ingresarlo en el SII;
- comprobar la cuadratura del total;
- registrar información de facturación;
- cargar el PDF;
- completar solicitudes;
- generar/copiar el mensaje al cliente;
- gestionar solicitudes de rectificación;
- registrar Notas de Crédito;
- generar y asociar nuevas facturas corregidas.

## 5.3 Administrador

Usuario con permisos de gestión.

Podrá:

- ver todas las solicitudes;
- reasignar solicitudes;
- corregir estados excepcionales;
- gestionar usuarios;
- gestionar bodegas;
- consultar auditoría;
- acceder a estadísticas;
- administrar configuraciones generales;
- autorizar excepciones administrativas cuando corresponda.

## 5.4 Jefatura / Gerencia

Usuario principalmente consultivo.

Podrá:

- consultar indicadores;
- visualizar facturación por período;
- visualizar facturación por bodega;
- consultar neto e IVA estimado;
- consultar facturación bruta emitida;
- consultar Notas de Crédito;
- consultar facturación neta vigente;
- consultar desempeño operacional;
- exportar información cuando se habilite dicha funcionalidad.

No requerirá permisos para modificar solicitudes salvo autorización específica.

---

# 6. Roles iniciales

```text
WAREHOUSE_USER
INVOICE_EXECUTOR
ADMIN
MANAGEMENT
```

Los nombres técnicos definitivos podrán ser establecidos en el documento de arquitectura/especificación técnica.

---

# 7. Alcance funcional V1

La primera versión deberá incluir:

## 7.1 Autenticación y usuarios
## 7.2 Solicitud de factura
## 7.3 Gestión de solicitudes
## 7.4 Detección de duplicados
## 7.5 Observaciones y correcciones
## 7.6 Gestión documental
## 7.7 Mensaje al cliente / WhatsApp
## 7.8 Clientes
## 7.9 Estadísticas
## 7.10 Auditoría
## 7.11 Configuración básica
## 7.12 Cálculo de precios netos para SII
## 7.13 Validación de cuadratura
## 7.14 Rectificación de facturas realizadas
## 7.15 Registro de Notas de Crédito

La generación tributaria de la Nota de Crédito continuará realizándose externamente en V1.

---

# 8. Integración con Hub Maxiofertas

El sistema deberá integrarse funcionalmente al Hub Maxiofertas.

Hub actual:

```text
https://maxiofertas-hub.vercel.app/
```

El Hub será el punto de acceso para los usuarios.

Deberá incorporarse una opción claramente identificable:

**Facturación**

La URL funcional podrá utilizar una ruta como:

```text
/facturas
```

La arquitectura definitiva determinará si el sistema forma parte del mismo proyecto frontend o se integra mediante navegación hacia una aplicación independiente.

Desde la perspectiva funcional, para el usuario deberá percibirse como parte del ecosistema Maxiofertas.

---

# 9. Módulo de solicitud de factura

## 9.1 Objetivo

Permitir a los usuarios autorizados ingresar correctamente una solicitud de factura.

## 9.2 Campos mínimos

La solicitud deberá considerar:

- Bodega.
- RUT.
- Razón social.
- Giro.
- Teléfono del cliente.
- Correo del cliente.
- Productos.
- Solicitante.
- Observaciones opcionales.

Para cada producto se deberá utilizar una estructura funcional equivalente a:

```text
Descripción
Cantidad
Precio unitario con IVA
Total con IVA
```

El precio ingresado por el solicitante será siempre el valor final pagado por unidad.

Ejemplo:

```text
Producto:
Toldo con estructura

Cantidad:
2

Precio unitario con IVA:
$28.000

Total:
$56.000
```

El total general de la solicitud será también un valor **IVA incluido**.

El solicitante no deberá ingresar, calcular ni visualizar:

```text
Precio neto
IVA unitario
IVA total
Porcentaje de IVA
Precio sin IVA
Base imponible
```

La interfaz deberá utilizar expresiones como:

**Precio con IVA**

o simplemente:

**Precio**

cuando el contexto deje inequívocamente claro que corresponde al precio final.

---

# 10. Validaciones de solicitud

El sistema deberá validar antes del envío:

- campos requeridos;
- RUT con formato razonable;
- total superior a cero;
- bodega válida;
- usuario válido;
- teléfono cuando sea requerido;
- existencia de productos;
- cantidades válidas;
- precios con IVA válidos;
- coherencia matemática entre cantidad, precio unitario con IVA y total;
- coherencia mínima de campos.

Los errores deberán mostrarse antes de crear la solicitud.

Una solicitud inválida no deberá ingresar silenciosamente a la cola.

---

# 11. Numeración de solicitudes

Cada solicitud deberá tener un identificador visible único.

Ejemplo:

```text
FAC-2026-0001842
```

La numeración sirve como identificador operacional y no necesariamente corresponde al folio tributario.

El folio de factura deberá almacenarse como dato separado si se implementa.

---

# 12. Detección de duplicados

Antes de crear una nueva solicitud, el sistema deberá buscar solicitudes recientes que puedan representar la misma operación.

La detección podrá considerar:

- RUT;
- total con IVA;
- bodega;
- productos;
- fecha/hora;
- solicitante.

### Duplicado exacto

Coincidencia alta entre RUT, total, productos y período reciente.

### Posible duplicado

Coincidencia entre elementos principales, por ejemplo mismo RUT, mismo total y período reciente.

### Coincidencia informativa

Mismo cliente con otra solicitud reciente, pero con valores distintos.

---

# 13. Comportamiento ante duplicados

El sistema deberá advertir:

> Existe una solicitud similar creada recientemente.

Deberá mostrar:

- número de solicitud;
- fecha;
- bodega;
- solicitante;
- total;
- estado.

El usuario podrá:

- abrir la solicitud existente;
- cancelar la nueva solicitud;
- crearla igualmente cuando exista una razón válida.

Si se crea deliberadamente pese a la advertencia, la acción deberá quedar registrada.

---

# 14. Estados de solicitud

Estados base:

```text
PENDIENTE
EN_PROCESO
OBSERVADA
REALIZADA
CANCELADA
DUPLICADA
```

Para el flujo de rectificación se deberán contemplar estados técnicos equivalentes a:

```text
RECTIFICACION_SOLICITADA
RECTIFICACION_EN_PROCESO
RECTIFICADA
```

Los nombres técnicos definitivos serán definidos en arquitectura.

Textos visibles sugeridos:

```text
Pendiente
En proceso
Necesita corrección
Lista / Realizada
Cancelada
Duplicada
Cambio solicitado
Corrigiendo factura
Factura corregida
```

No se permitirá que los usuarios inventen estados mediante texto libre.

---

# 15. Estado PENDIENTE

Una solicitud entra en `PENDIENTE` cuando:

- fue creada correctamente;
- superó validaciones;
- no ha sido tomada por un ejecutor;
- no fue cancelada ni clasificada como duplicada.

---

# 16. Estado EN_PROCESO

La solicitud pasa a `EN_PROCESO` cuando un ejecutor selecciona:

**Tomar solicitud**

El sistema deberá registrar ejecutor, fecha y hora.

Una solicitud en proceso deberá mostrar claramente quién la está gestionando.

---

# 17. Control de concurrencia

El sistema debe impedir que dos ejecutores tomen simultáneamente la misma solicitud.

La asignación deberá gestionarse de forma atómica o transaccional.

Si otro ejecutor intenta tomar una solicitud ya asignada, deberá recibir un mensaje similar a:

> Esta solicitud ya está siendo gestionada por otro usuario.

---

# 18. Cola de facturación

El panel principal de los ejecutores deberá mostrar prioritariamente las solicitudes pendientes.

Regla predeterminada:

**más antigua primero.**

```text
created_at ASC
```

Las rectificaciones deberán mostrarse en una sección claramente diferenciada denominada:

**Cambios solicitados**

y ordenarse por antigüedad de solicitud de cambio.

La política administrativa sobre si las rectificaciones tienen prioridad absoluta sobre nuevas solicitudes queda pendiente de definición. En cualquier caso, no deberán quedar ocultas ni mezclarse silenciosamente con facturas nuevas.

---

# 19. Indicador de antigüedad

Las solicitudes deberán mostrar tiempo transcurrido desde su creación.

Ejemplo:

```text
12 min
48 min
1 h 32 min
3 h 18 min
```

Se podrán utilizar rangos visuales:

```text
< 30 minutos
30–60 minutos
1–2 horas
> 2 horas
```

Los colores exactos serán definidos en diseño UX.

---

# 20. Observaciones

Cuando un ejecutor no pueda emitir una factura por problemas con los datos, podrá marcarla como:

```text
OBSERVADA
```

Deberá seleccionar o indicar un motivo.

---

# 21. Motivos de observación

Inicialmente:

- RUT incorrecto.
- Razón social incorrecta.
- Giro incorrecto.
- Total no coincide.
- Productos incompletos.
- Precio incorrecto.
- Falta información.
- Datos tributarios inconsistentes.
- Solicitud duplicada.
- Otro.

`Otro` deberá exigir comentario.

---

# 22. Corrección de solicitudes

Una solicitud observada deberá quedar disponible para el solicitante correspondiente.

El solicitante podrá:

- revisar motivo;
- corregir los campos autorizados;
- reenviar.

Al reenviarse:

- se conservará el historial;
- se registrará quién modificó;
- se registrarán fecha y hora;
- regresará al flujo operativo.

El comportamiento exacto del estado posterior será definido técnicamente.

Una solicitud `REALIZADA` no podrá editarse de esta manera. Para ella se aplicará exclusivamente el proceso de rectificación definido en este documento.

---

# 23. Historial de cambios

Cada solicitud deberá mantener historial de:

- creación;
- cambios;
- asignación;
- observación;
- corrección;
- cancelación;
- clasificación como duplicada;
- carga documental;
- finalización;
- solicitud de rectificación;
- toma de rectificación;
- registro de Nota de Crédito;
- anulación/rectificación de la factura original;
- emisión de nueva factura;
- finalización de rectificación.

No deberán eliminarse eventos históricos por modificaciones posteriores.

---

# 24. Emisión de factura

La emisión tributaria se realizará inicialmente fuera del sistema.

El ejecutor continuará utilizando el mecanismo autorizado por la empresa, incluido el sistema del SII cuando corresponda.

El sistema servirá como apoyo al proceso.

---

# 25. Datos preparados para facturación y cálculo neto

La pantalla del ejecutor deberá presentar, como mínimo:

- RUT;
- razón social;
- giro;
- productos;
- cantidad;
- precio con IVA;
- precio neto calculado;
- total con IVA solicitado.

Para productos afectos a IVA estándar del 19%:

```text
Precio neto teórico = Precio con IVA / 1,19
```

El cálculo y política exacta de redondeo deberán definirse en la especificación técnica.

El resultado deberá almacenarse o calcularse de forma determinística.

Ejemplo:

```text
Toldo con estructura

Cantidad:
2

Precio con IVA:
$28.000

Precio neto para SII:
$23.529
[Copiar]
```

El campo prioritario para copiar hacia el SII será:

**Precio neto para SII**

---

# 26. Validación de cuadratura SII

El ejecutor utilizará el precio neto calculado para ingresarlo en el formulario del SII.

El SII calculará posteriormente el IVA y el total.

El sistema deberá facilitar la comparación:

```text
Total solicitado con IVA
vs.
Total calculado por SII con IVA
```

Antes de finalizar una factura, el ejecutor deberá confirmar que:

> El total con IVA generado por el SII coincide con el total con IVA solicitado.

Ejemplo:

```text
TOTAL ESPERADO SEGÚN SOLICITUD

$68.000
```

El ejecutor podrá ingresar o confirmar el total final del SII.

Si existe diferencia:

```text
El total no coincide.

Solicitud:
$68.000

SII:
$67.999

Revisa los precios netos antes de continuar.
```

La especificación técnica deberá definir tolerancias y redondeos permitidos.

---

# 27. Finalización de factura

Una solicitud sólo podrá marcarse como `REALIZADA` cuando se hayan cumplido los requisitos mínimos:

- factura emitida externamente;
- documento PDF asociado;
- ejecutor identificado;
- fecha de finalización registrada;
- validación de cuadratura entre total solicitado con IVA y total resultante del SII.

Una factura no debería finalizar normalmente cuando exista una diferencia no resuelta.

Las excepciones deberán requerir autorización administrativa y quedar auditadas.

Si el sistema incorpora folio, este podrá convertirse posteriormente en requisito obligatorio.

---

# 28. Gestión de documentos

## 28.1 Carga

El ejecutor deberá poder cargar el PDF mediante:

- selección de archivo;
- arrastrar y soltar.

## 28.2 Validaciones

- tipo de archivo permitido;
- tamaño;
- integridad básica;
- asociación a la solicitud correcta.

Inicialmente:

```text
application/pdf
```

## 28.3 Tamaño máximo

Se propone inicialmente:

**2 MB por documento.**

Este valor deberá quedar configurable o técnicamente modificable.

---

# 29. Almacenamiento documental

Los documentos se almacenarán inicialmente en un servicio de almacenamiento de objetos.

Alternativa funcional preferida:

**Cloudflare R2.**

La decisión definitiva corresponde al documento de arquitectura.

---

# 30. Política de capacidad de almacenamiento

El sistema deberá registrar y monitorear:

- cantidad de archivos;
- tamaño por archivo;
- almacenamiento acumulado.

Política inicial:

- objetivo preventivo inferior a 8 GB;
- alertas administrativas antes del límite de la cuota gratuita utilizada como referencia;
- no borrar documentos automáticamente únicamente por antigüedad.

La política definitiva de retención deberá cumplir requerimientos aplicables.

---

# 31. Nombre de archivos

Ejemplo:

```text
FAC-2026-0001842_76123456-7.pdf
```

El nombre físico no será el único identificador en base de datos.

---

# 32. Acceso al documento

Una factura realizada deberá permitir:

- visualizar documento;
- abrir enlace;
- copiar enlace.

La estrategia de URL pública, privada o firmada será definida técnicamente.

---

# 33. Generación de mensaje al cliente

Después de registrar la factura:

```text
Hola, anexo factura solicitada.

RUT: 76.123.456-7
Razón Social: Comercial Ejemplo SPA
Total facturado: $125.000

Factura: [URL]

Gracias.
```

El contenido deberá poder configurarse posteriormente.

Después de una rectificación, la nueva factura deberá generar un nuevo mensaje que permita indicar que la factura anterior fue anulada y que se adjunta la factura corregida.

---

# 34. Acciones sobre mensaje

El usuario deberá disponer de:

- Copiar mensaje.
- Abrir WhatsApp.

Cuando exista un teléfono válido, el sistema deberá preparar un enlace de WhatsApp con el mensaje precargado.

El envío efectivo podrá seguir siendo manual.

---

# 35. Módulo de clientes

Los clientes se identificarán principalmente mediante RUT.

Datos iniciales:

- RUT.
- Razón social.
- Giro.
- Teléfono.
- Correo.
- Fecha de creación.
- Fecha de última actualización.

---

# 36. Autocompletado de clientes

Al ingresar un RUT conocido, el sistema podrá completar:

- razón social;
- giro;
- teléfono;
- correo.

El usuario podrá corregir información cuando corresponda.

Las modificaciones relevantes deberán quedar auditadas.

---

# 37. Historial del cliente

Desde la ficha del cliente deberá ser posible consultar solicitudes anteriores cuando el rol lo permita.

Ejemplo:

```text
Cliente: Comercial ABC SPA

Solicitudes: 8
Facturado acumulado: $1.845.000
Última factura: 12/08/2026
```

Los indicadores visibles dependerán del rol.

---

# 38. Facturas realizadas e inmutabilidad

Una vez que una solicitud se encuentre `REALIZADA`, la solicitud original y su factura emitida deberán considerarse **cerradas e inmutables para el solicitante**.

El solicitante:

- puede visualizarla;
- puede acceder a la factura;
- puede solicitar una rectificación;
- no puede editar directamente los datos originales.

Una factura ya emitida nunca deberá ser reemplazada silenciosamente ni sobrescrita.

La factura original deberá conservarse como parte del historial.

---

# 39. Solicitar cambio de una factura realizada

En una factura realizada deberá existir:

**Solicitar cambio**

El solicitante deberá indicar:

```text
¿Qué está incorrecto?
```

Opciones iniciales:

- RUT.
- Razón social.
- Giro.
- Producto.
- Cantidad.
- Precio.
- Total.
- Otro.

Deberá poder explicar el cambio requerido.

Ejemplos de uso:

- RUT incorrecto;
- razón social incorrecta;
- giro incorrecto;
- productos incorrectos;
- cantidad incorrecta;
- precio incorrecto;
- total incorrecto;
- otro dato que requiera reemplazar el documento.

---

# 40. Flujo de rectificación

```text
Factura realizada
↓
Solicitante detecta error
↓
Solicitar cambio
↓
Solicitud de rectificación
↓
Ejecutor revisa
↓
Genera Nota de Crédito
↓
Registra Nota de Crédito
↓
Factura original queda marcada como anulada/rectificada
↓
Ejecutor genera nueva factura
↓
Carga nueva factura
↓
Rectificación finalizada
```

---

# 41. Nota de Crédito

Cuando una factura realizada deba ser sustituida, el ejecutor deberá gestionar externamente la correspondiente **Nota de Crédito** mediante el sistema tributario utilizado por Maxiofertas.

El Sistema de Gestión de Facturas Maxiofertas no generará tributariamente la Nota de Crédito en V1.

Sí deberá registrar:

- existencia de la Nota de Crédito;
- fecha;
- ejecutor;
- documento asociado;
- folio, si se dispone;
- observación;
- factura original afectada.

El ejecutor deberá disponer de una etapa explícita:

**Registrar Nota de Crédito**

Campos funcionales iniciales:

```text
Folio de Nota de Crédito
Fecha
Documento PDF
Observación
```

El detalle definitivo deberá definirse técnicamente.

---

# 42. Estado de factura original rectificada

Una factura anulada mediante Nota de Crédito deberá continuar disponible en historial.

Debe mostrarse de forma inequívoca como:

**Anulada mediante Nota de Crédito**

o:

**Rectificada**

No deberá desaparecer.

---

# 43. Nueva factura corregida

Después de registrar la Nota de Crédito, el ejecutor deberá generar una nueva factura con los datos corregidos.

La nueva factura:

- tendrá su propio documento;
- tendrá su propio folio tributario, cuando se registre;
- tendrá su propia fecha de emisión;
- estará vinculada a la solicitud original y al proceso de rectificación.

En un proceso de rectificación, el sistema no deberá marcar la nueva factura como finalizada mientras no se haya registrado previamente la Nota de Crédito correspondiente, salvo excepción administrativa explícita.

---

# 44. Relación documental de rectificación

El sistema deberá representar conceptualmente:

```text
Solicitud original
│
├── Factura original
│
├── Nota de Crédito
│
└── Nueva factura corregida
```

Si existieran posteriores rectificaciones, no deberá perderse la cadena histórica.

---

# 45. Vista del ejecutor para rectificaciones

Deberá distinguir claramente:

```text
NUEVA FACTURA
```

de:

```text
CAMBIO DE FACTURA YA EMITIDA
```

La pantalla de rectificación deberá mostrar:

## Factura original

```text
Número de solicitud
Cliente
RUT
Productos
Total
Fecha de emisión
Factura PDF
```

## Cambio solicitado

```text
Campo incorrecto
Valor actual
Valor solicitado
Comentario del solicitante
```

---

# 46. Auditoría de rectificación

Se deberá registrar:

- quién solicitó el cambio;
- cuándo;
- qué dato se indicó como incorrecto;
- factura original;
- quién tomó la rectificación;
- Nota de Crédito;
- fecha de Nota de Crédito;
- nueva factura;
- fecha de nueva factura;
- ejecutor responsable.

---

# 47. Módulo de estadísticas

Objetivo: entregar a jefatura y administración información clara sobre:

- montos facturados;
- actividad;
- IVA asociado a ventas;
- desempeño por bodega;
- desempeño operacional;
- Notas de Crédito;
- facturación vigente.

---

# 48. Regla de contabilización

Una solicitud sólo deberá incorporarse a las estadísticas de facturación cuando esté `REALIZADA` y su factura se mantenga vigente.

Las solicitudes:

- pendientes;
- observadas;
- canceladas;
- duplicadas

no deberán sumarse como facturación efectiva.

Una factura anulada completamente mediante Nota de Crédito no deberá continuar sumándose como facturación vigente.

La nueva factura corregida sí deberá incorporarse según su propia fecha de emisión.

Para V1 se priorizará:

> **Factura anulada completamente y reemplazada por una nueva factura.**

El tratamiento de notas de crédito parciales, diferencias, ajustes o períodos tributarios distintos deberá definirse antes de soportar casos avanzados.

---

# 49. Fecha de estadísticas

Los reportes financieros utilizarán preferentemente la:

**fecha de emisión/finalización de factura**

y no la fecha original de solicitud.

Una nueva factura derivada de una rectificación se contabilizará según su propia fecha de emisión.

---

# 50. Indicadores financieros

El dashboard deberá incluir:

### Total facturado / facturación neta vigente

Monto bruto IVA incluido correspondiente a facturas vigentes.

### Facturación bruta emitida

Monto de documentos emitidos antes de considerar anulaciones cuando este desglose resulte necesario.

### Notas de Crédito

Monto o cantidad asociada a documentos de rectificación cuando corresponda.

### Neto estimado

Calculado a partir del total cuando corresponda.

### IVA débito fiscal estimado

IVA contenido en las ventas vigentes registradas.

### Cantidad de facturas

Número de facturas vigentes contabilizadas.

### Ticket promedio

```text
Total facturado vigente / cantidad de facturas vigentes
```

La definición contable definitiva deberá validarse antes de usar estos valores como reporte tributario formal.

---

# 51. Cálculo referencial IVA

Para factura estándar con IVA de 19% incluido:

```text
Neto = Total / 1,19
IVA = Total - Neto
```

El sistema deberá denominar el indicador:

**IVA débito fiscal estimado**

o equivalente.

No deberá presentarse como:

**IVA a pagar**

porque el impuesto final puede depender de elementos externos al alcance del sistema.

---

# 52. Filtros de estadísticas

Como mínimo:

- mes;
- año;
- rango de fechas;
- bodega.

Posteriormente:

- ejecutor;
- solicitante;
- cliente.

---

# 53. Desglose por bodega

Mostrar:

- total facturado vigente por bodega;
- número de facturas;
- participación porcentual;
- ticket promedio.

---

# 54. Comparaciones temporales

Dejar previsto:

- mes actual vs. mes anterior;
- período actual vs. mismo período del año anterior.

Estas funciones podrán implementarse gradualmente.

---

# 55. Estadísticas operacionales

El sistema deberá permitir medir:

- solicitudes creadas;
- pendientes;
- en proceso;
- observadas;
- realizadas;
- canceladas;
- duplicadas;
- rectificaciones solicitadas;
- rectificaciones en proceso;
- rectificaciones completadas;
- tiempo promedio de resolución;
- facturas por ejecutor;
- solicitudes por bodega.

---

# 56. Dashboard inicial de jefatura

Como mínimo:

```text
Total facturado del mes
Neto estimado
IVA débito fiscal estimado
Facturas realizadas
Facturas pendientes
Ticket promedio
```

Cuando corresponda:

```text
Facturación bruta emitida
Notas de crédito
Facturación neta vigente
```

Además:

- gráfico de evolución mensual;
- ranking o desglose por bodega.

---

# 57. Dashboard de ejecutores

Debe priorizar el trabajo pendiente.

Elementos iniciales:

```text
Pendientes
En proceso
Observadas
Cambios solicitados
Realizadas hoy
```

La lista principal deberá mostrar las solicitudes más antiguas primero.

---

# 58. Dashboard de bodega / solicitante

Debe mostrar:

```text
Nueva solicitud
Pendientes
En proceso
Necesitan corrección
Realizadas
Cambios solicitados
```

Y permitir consultar solicitudes propias o de la bodega según reglas de permisos.

---

# 59. Auditoría general

Las acciones críticas deberán registrarse.

Como mínimo:

- usuario;
- acción;
- entidad afectada;
- fecha;
- hora;
- valores relevantes anteriores/posteriores cuando corresponda.

---

# 60. Eventos auditables

Entre otros:

- creación de solicitud;
- edición;
- toma de solicitud;
- reasignación;
- observación;
- corrección;
- cancelación;
- clasificación como duplicada;
- carga/reemplazo de documento;
- validación de cuadratura;
- finalización;
- solicitud de cambio;
- registro de Nota de Crédito;
- creación de nueva factura corregida;
- cierre de rectificación;
- cambios administrativos.

---

# 61. Eliminación de solicitudes

Por defecto, las solicitudes no deberán eliminarse físicamente.

Cuando una solicitud no corresponda deberá utilizarse:

```text
CANCELADA
```

o:

```text
DUPLICADA
```

Las facturas rectificadas tampoco se eliminan; se conservan marcadas según su situación.

---

# 62. Reasignación

Un administrador deberá poder reasignar una solicitud en proceso o una rectificación en proceso.

La acción deberá:

- exigir o permitir una razón;
- registrar ejecutor anterior;
- registrar ejecutor nuevo;
- quedar auditada.

---

# 63. Búsqueda

Por:

- número de solicitud;
- RUT;
- razón social;
- teléfono;
- bodega.

Podrán incorporarse otros criterios posteriormente.

---

# 64. Filtros personales

Los filtros utilizados por un usuario no deberán modificar la vista de otros.

Serán:

- locales al usuario;
- locales a la sesión;
- o persistidos individualmente.

Nunca globales salvo configuración administrativa explícita.

---

# 65. Diseño orientado a usuarios no técnicos

El producto deberá asumir alfabetización digital básica en parte de los usuarios.

Por tanto:

- navegación simple;
- acciones explícitas;
- mínimo número de pasos;
- textos claros;
- evitar conceptos técnicos;
- evitar interfaces similares a bases de datos;
- evitar edición directa de estados;
- botones grandes y reconocibles cuando corresponda;
- diseño responsive.

El solicitante no deberá necesitar comprender IVA, neto o cálculos tributarios.

---

# 66. Uso móvil

El formulario de solicitud deberá funcionar correctamente desde teléfonos móviles.

Las funciones principales de consulta también deberán ser utilizables desde móvil.

El panel intensivo de facturación puede priorizar escritorio, manteniendo funcionalidad responsive básica.

---

# 67. Rendimiento esperado

El sistema deberá manejar cómodamente la operación actual y permitir crecimiento.

No se requiere arquitectura de escala masiva.

Prioridades:

- simplicidad;
- confiabilidad;
- bajo costo;
- mantenibilidad.

---

# 68. Disponibilidad

Una interrupción no debe provocar pérdida de solicitudes ya almacenadas.

Las estrategias técnicas de alta disponibilidad y recuperación serán definidas en arquitectura.

---

# 69. Seguridad

Como mínimo:

- autenticación;
- autorización por roles;
- aislamiento de funciones administrativas;
- validación del lado servidor;
- protección de documentos;
- almacenamiento seguro de secretos;
- auditoría.

---

# 70. Privacidad

El sistema manejará:

- RUT;
- razón social;
- teléfono;
- correo;
- documentos tributarios.

El acceso deberá limitarse a usuarios autorizados según función.

---

# 71. Migración del sistema actual

El Google Sheet existente será considerado fuente histórica.

No deberá eliminarse.

Se deberá evaluar importar:

- solicitudes;
- clientes;
- estados;
- enlaces de facturas;
- fechas;
- bodegas;
- solicitantes.

---

# 72. Calidad de datos históricos

La información histórica contiene:

- estados no normalizados;
- RUT con distintos formatos;
- campos incompletos;
- observaciones utilizadas como estados;
- registros duplicados;
- totales con formatos diferentes.

La migración requerirá normalización.

No se asumirá que todos los registros históricos cumplen el modelo futuro.

---

# 73. Estrategia de migración sugerida

```text
Google Sheets
   ↓
Extracción
   ↓
Normalización
   ↓
Validación
   ↓
Importación
   ↓
Verificación
   ↓
Google Sheet en modo histórico
```

---

# 74. Retiro de Google Forms

Una vez validado el nuevo sistema:

- comunicar nueva URL;
- Hub dirige al nuevo formulario;
- Google Forms deja de ser canal principal.

El formulario antiguo podrá mantenerse temporalmente como contingencia.

---

# 75. Fuera de alcance V1

No forma parte obligatoria de V1:

- emisión directa de facturas electrónicas;
- integración directa con SII para emisión;
- generación tributaria automática de Notas de Crédito;
- firma electrónica de DTE;
- generación propia de XML tributario;
- contabilidad completa;
- libro de ventas;
- libro de compras;
- cálculo definitivo de impuestos;
- conciliación bancaria;
- cuentas por cobrar;
- ERP;
- gestión de inventario;
- envío automático de WhatsApp sin intervención humana;
- aplicación móvil nativa;
- soporte avanzado de notas de crédito parciales y ajustes complejos.

---

# 76. Integración tributaria futura

La arquitectura deberá evitar bloquear una futura integración con sistemas de emisión DTE.

Ninguna integración tributaria futura deberá implementarse por Antigravity sin una especificación aprobada independiente.

---

# 77. Reglas de negocio críticas

## RN-001
Toda solicitud debe pertenecer a una bodega.

## RN-002
Toda solicitud debe tener un solicitante identificable.

## RN-003
Una solicitud pendiente puede ser tomada por un solo ejecutor simultáneamente.

## RN-004
Los filtros de un usuario no deben afectar a otros usuarios.

## RN-005
Los estados son controlados por el sistema.

## RN-006
Una solicitud observada debe conservar su historial.

## RN-007
Una solicitud realizada debe tener documento asociado, salvo excepción administrativa expresamente definida.

## RN-008
Una solicitud cancelada no suma en estadísticas de facturación.

## RN-009
Una solicitud duplicada no suma en estadísticas de facturación.

## RN-010
Una solicitud observada no suma en estadísticas.

## RN-011
Las estadísticas financieras se calculan sobre facturas realizadas y vigentes.

## RN-012
La fecha de facturación determina el período estadístico.

## RN-013
El sistema debe advertir duplicados antes de crearlos cuando sea posible.

## RN-014
El usuario puede crear deliberadamente una solicitud similar si la operación realmente corresponde.

## RN-015
La creación deliberada pese a una advertencia de duplicado debe quedar registrada.

## RN-016
Las acciones administrativas críticas deben ser auditables.

## RN-017
Los documentos no deben eliminarse automáticamente únicamente por superar una cantidad arbitraria de archivos.

## RN-018
El almacenamiento deberá monitorearse por capacidad.

## RN-019
El IVA mostrado será estimado sobre las ventas registradas y no deberá representarse automáticamente como impuesto final a pagar.

## RN-020
Las solicitudes no se eliminan de forma normal; se cancelan o clasifican según corresponda.

## RN-021
Todo precio ingresado por el solicitante incluye IVA.

## RN-022
El solicitante nunca debe ingresar el precio neto.

## RN-023
El sistema calculará automáticamente el precio neto necesario para facturación.

## RN-024
El ejecutor podrá visualizar y copiar el precio neto.

## RN-025
El total con IVA calculado por el SII deberá contrastarse con el total solicitado.

## RN-026
Una factura realizada no puede ser modificada directamente por el solicitante.

## RN-027
Una factura realizada puede generar una solicitud de rectificación.

## RN-028
Toda rectificación debe conservar la factura original.

## RN-029
Una factura sustituida deberá registrar una Nota de Crédito antes de la nueva factura, salvo excepción administrativa autorizada.

## RN-030
Una factura anulada mediante Nota de Crédito deberá quedar identificada como tal.

## RN-031
La nueva factura corregida constituye un documento independiente.

## RN-032
Toda la cadena de rectificación deberá permanecer auditada.

## RN-033
Una factura completamente anulada mediante Nota de Crédito no deberá contabilizarse como facturación vigente.

## RN-034
La nueva factura corregida se contabilizará según su propia fecha de emisión.

---

# 78. Historias de usuario principales

## US-001 — Crear solicitud

Como encargado de bodega, quiero ingresar una solicitud de factura para que el equipo pueda procesarla.

### Criterios de aceptación

- puedo completar los datos;
- los productos se ingresan como líneas estructuradas;
- ingreso cantidad y precio unitario con IVA;
- nunca se me solicita precio neto;
- recibo validaciones;
- el sistema revisa duplicados;
- recibo número de solicitud;
- queda registrada fecha/hora;
- aparece en la cola.

## US-002 — Advertencia de duplicado

Como solicitante, quiero saber si existe una solicitud parecida para evitar crearla dos veces.

### Criterios de aceptación

- se muestran coincidencias recientes;
- puedo abrir la existente;
- puedo cancelar;
- puedo continuar bajo advertencia.

## US-003 — Tomar solicitud

Como ejecutor, quiero tomar una solicitud pendiente para indicar que estoy trabajando en ella.

### Criterios de aceptación

- cambia a `EN_PROCESO`;
- registra mi usuario;
- registra hora;
- otros usuarios ven que está asignada;
- ningún otro ejecutor puede tomarla simultáneamente.

## US-004 — Observar solicitud

Como ejecutor, quiero devolver una solicitud con un motivo para que la bodega pueda corregirla.

### Criterios de aceptación

- selecciono motivo;
- puedo agregar comentario;
- cambia a `OBSERVADA`;
- solicitante puede verla;
- queda historial.

## US-005 — Corregir solicitud

Como solicitante, quiero corregir una solicitud observada para que pueda procesarse nuevamente.

### Criterios de aceptación

- veo motivo;
- puedo corregir campos autorizados;
- puedo reenviar;
- se registra historial.

## US-006 — Completar factura

Como ejecutor, quiero subir el PDF generado para finalizar la solicitud.

### Criterios de aceptación

- sólo acepta formato permitido;
- archivo queda asociado;
- veo precio neto calculado por producto;
- puedo copiar el precio neto;
- veo el total esperado con IVA;
- compruebo el total generado por SII;
- el sistema advierte diferencias;
- queda registrada fecha;
- solicitud pasa a `REALIZADA` sólo cuando cumple reglas;
- se genera el mensaje al cliente.

## US-007 — Copiar mensaje

Como ejecutor, quiero copiar un mensaje generado automáticamente para enviarlo rápidamente al cliente.

### Criterios de aceptación

- contiene datos de cliente;
- contiene total;
- contiene enlace;
- se copia con una acción.

## US-008 — Abrir WhatsApp

Como ejecutor, quiero abrir WhatsApp con el mensaje listo para reducir pasos manuales.

## US-009 — Consultar estadísticas

Como jefe, quiero conocer cuánto se ha facturado durante un período para monitorear el desempeño del negocio.

### Criterios de aceptación

- filtro por mes;
- veo total facturado vigente;
- veo neto estimado;
- veo IVA débito estimado;
- veo número de facturas;
- veo desglose por bodega;
- puedo distinguir Notas de Crédito y facturas rectificadas cuando corresponda.

## US-010 — Solicitar cambio de factura realizada

Como solicitante, quiero informar un error en una factura ya emitida para que pueda ser anulada y reemplazada correctamente.

### Criterios de aceptación

- puedo abrir una factura realizada;
- no puedo editarla directamente;
- existe `Solicitar cambio`;
- indico qué está incorrecto;
- puedo explicar el cambio;
- queda registrada la solicitud;
- puedo consultar su estado.

## US-011 — Procesar rectificación

Como ejecutor, quiero gestionar una factura que necesita ser corregida para emitir la Nota de Crédito y posteriormente una nueva factura.

### Criterios de aceptación

- veo claramente la factura original;
- veo el cambio solicitado;
- registro la Nota de Crédito;
- la factura anterior queda identificada como anulada;
- genero la nueva factura;
- cargo el nuevo documento;
- el sistema mantiene vínculos entre todos los documentos.

## US-012 — Comprobar cuadratura

Como ejecutor, quiero ver el precio neto calculado y el total esperado con IVA para ingresar correctamente los valores en el SII y comprobar que el resultado coincide.

### Criterios de aceptación

- veo precio con IVA;
- veo precio neto calculado;
- puedo copiar el neto;
- veo total esperado;
- puedo comprobar el total generado por SII;
- el sistema advierte diferencias.

---

# 79. Indicadores de éxito del producto

Después de la implementación deberán medirse:

- reducción de solicitudes duplicadas;
- reducción de consultas manuales sobre duplicados;
- reducción de errores por filtros compartidos;
- reducción del tiempo de procesamiento;
- reducción de pasos posteriores a la emisión;
- porcentaje de solicitudes observadas;
- tiempo promedio de resolución;
- adopción por bodegas;
- cantidad de solicitudes procesadas;
- estabilidad operacional;
- frecuencia de diferencias de cuadratura;
- cantidad de rectificaciones;
- tiempo promedio de rectificación.

---

# 80. Objetivos cualitativos de éxito

El producto será considerado exitoso si:

- las bodegas pueden solicitar facturas sin Google Forms;
- los ejecutores dejan de depender del Google Sheet;
- ningún ejecutor puede ocultar solicitudes a otros mediante filtros;
- las solicitudes duplicadas disminuyen significativamente;
- existe trazabilidad de estados;
- el solicitante trabaja sólo con precios finales IVA incluido;
- el ejecutor dispone del neto para SII sin calcularlo manualmente;
- la carga de PDF y generación del mensaje son simples;
- las facturas emitidas pueden rectificarse sin sobrescribir el historial;
- la gerencia puede consultar facturación vigente sin procesar manualmente una hoja.

---

# 81. Restricciones del proyecto

Priorizar:

- costo operativo bajo;
- infraestructura simple;
- reutilización razonable del ecosistema Maxiofertas;
- tecnologías conocidas y mantenibles;
- evitar dependencias innecesarias;
- evitar arquitectura sobredimensionada.

---

# 82. Principios del producto

## Simplicidad
La interfaz debe ser más simple que Google Sheets.

## Trazabilidad
Las acciones importantes deben quedar registradas.

## Datos estructurados
Los estados y reglas no deben depender de textos libres.

## Prevención antes que corrección
El sistema debe intentar detectar problemas antes de ingresar una solicitud.

## Una sola fuente de verdad
La base de datos del sistema será la fuente operacional principal después de la migración.

## Prioridad operacional
La solicitud más antigua debe recibir prioridad por defecto.

## Bajo costo
Las decisiones técnicas deben considerar costos de infraestructura y mantenimiento.

## Inmutabilidad documental
Una factura emitida no se sobrescribe. Las rectificaciones crean nuevos documentos vinculados.

---

# 83. Dependencias

Como mínimo:

- Hub Maxiofertas;
- mecanismo de autenticación definido;
- base de datos;
- almacenamiento documental;
- infraestructura de despliegue;
- acceso humano al sistema de emisión tributaria.

---

# 84. Riesgos funcionales

## RF-001 — Datos incorrectos ingresados por bodega

Mitigación:

- validaciones;
- autocompletado;
- catálogo de clientes;
- observaciones.

## RF-002 — Duplicados no detectados

Mitigación:

- heurística de duplicados;
- búsqueda previa;
- histórico.

## RF-003 — Falsos positivos de duplicado

Mitigación:

- advertencia en lugar de bloqueo absoluto.

## RF-004 — Usuarios con baja alfabetización digital

Mitigación:

- interfaz simple;
- UX guiada;
- controles explícitos;
- ocultar cálculos tributarios al solicitante.

## RF-005 — Acumulación documental

Mitigación:

- monitoreo de almacenamiento;
- límites de tamaño;
- política de retención.

## RF-006 — Estadísticas incorrectas

Mitigación:

- contabilizar únicamente facturas vigentes;
- utilizar fecha de emisión;
- validar importes;
- descontar correctamente facturas completamente anuladas mediante Nota de Crédito.

## RF-007 — Diferencias por redondeo entre sistema y SII

Mitigación:

- política determinística de cálculo;
- tolerancia explícita;
- validación previa a finalización.

## RF-008 — Pérdida de trazabilidad en rectificaciones

Mitigación:

- inmutabilidad de documentos originales;
- vínculos entre factura original, Nota de Crédito y nueva factura;
- auditoría obligatoria.

---

# 85. Decisiones funcionales aprobadas

Se consideran aprobadas para documentos posteriores:

1. Se reemplazará progresivamente Google Forms/Sheets como sistema operacional.
2. El sistema tendrá base de datos propia.
3. El Hub Maxiofertas será punto de entrada.
4. Existirá un formulario propio.
5. Se detectarán posibles duplicados.
6. El duplicado no se bloqueará siempre de forma absoluta.
7. Existirá una cola priorizada por antigüedad.
8. Un ejecutor podrá tomar una solicitud.
9. Se evitará procesamiento concurrente.
10. Existirán estados normalizados.
11. Existirán solicitudes observadas y correcciones.
12. Los PDFs se almacenarán mediante un sistema de almacenamiento de objetos.
13. Cloudflare R2 es la alternativa preferida inicial.
14. No se eliminarán automáticamente facturas antiguas únicamente para mantener una cantidad fija.
15. Existirá monitoreo de almacenamiento.
16. El sistema generará automáticamente mensajes.
17. Se facilitará la apertura de WhatsApp.
18. Existirá base reutilizable de clientes.
19. Existirá autocompletado por RUT cuando el cliente ya exista.
20. Existirá módulo de estadísticas.
21. Las estadísticas contabilizarán facturas realizadas y vigentes.
22. Se calculará neto e IVA débito estimado.
23. El IVA mostrado no representa automáticamente el impuesto final a pagar.
24. La emisión tributaria directa queda fuera de V1.
25. El sistema deberá mantener auditoría.
26. Los precios ingresados por bodegas incluyen IVA.
27. El solicitante no trabaja con precios netos.
28. El sistema calcula el neto automáticamente.
29. El ejecutor utiliza el precio neto para ingresar productos en SII.
30. El ejecutor compara el total final del SII contra el total solicitado.
31. Las facturas realizadas son inmutables para el solicitante.
32. Una factura realizada puede recibir una solicitud de cambio.
33. La corrección posterior a emisión se realiza mediante Nota de Crédito y nueva factura.
34. La factura original nunca se elimina.
35. Los documentos de la rectificación permanecen relacionados.
36. Las anulaciones deberán reflejarse correctamente en estadísticas.
37. Las rectificaciones tendrán trazabilidad completa.

---

# 86. Preguntas que deberán resolverse en documentos posteriores

Estas preguntas no bloquean la aprobación funcional del PRD, pero deberán cerrarse antes de implementación completa.

## Usuarios y autenticación

- ¿Se reutilizará autenticación existente del Hub?
- ¿Habrá acceso con correo/contraseña?
- ¿Se utilizará SSO?

## Bodegas

- ¿Un usuario puede pertenecer a varias bodegas?
- ¿Qué administradores pueden modificar la bodega de una solicitud?

## Facturación

- ¿El folio de factura será obligatorio?
- ¿Se registrará fecha exacta de emisión?
- ¿Se registrará tipo de documento tributario?
- ¿Cuál será la política exacta de redondeo y tolerancia para cuadratura SII?

## Productos

**Resuelto por v1.1:** los productos se manejarán como líneas estructuradas con descripción, cantidad, precio unitario con IVA y total con IVA.

Queda por definir técnicamente:

- precisión y tipo numérico;
- política de redondeo;
- tratamiento futuro de productos exentos o con tasas distintas.

## Clientes

- ¿Quién puede modificar datos maestros?
- ¿La modificación de un cliente existente actualiza futuras solicitudes solamente?

## WhatsApp

- ¿El ejecutor siempre será responsable del envío?
- ¿Se necesita un estado adicional `ENVIADA_AL_CLIENTE`?

## Estadísticas

- ¿Se requiere exportación Excel/CSV desde V1?
- ¿Qué nivel de detalle se mostrará para Notas de Crédito?

## Rectificaciones

- ¿Las rectificaciones tendrán prioridad administrativa sobre nuevas solicitudes?
- ¿Qué roles pueden autorizar una excepción para crear la nueva factura sin Nota de Crédito previamente registrada?
- ¿Qué política se aplicará a rectificaciones múltiples encadenadas?

## Migración

- ¿Cuántos años históricos se importarán?
- ¿Los documentos existentes de Drive se migrarán a R2 o conservarán sus URLs actuales?

---

# 87. Criterio de aprobación del PRD

El PRD podrá declararse:

**APROBADO**

cuando los responsables confirmen que:

- el alcance refleja la operación deseada;
- los roles principales son correctos;
- los estados son correctos;
- las reglas de negocio principales están aceptadas;
- las reglas de precios IVA incluido están aceptadas;
- el flujo de cuadratura SII está aceptado;
- el flujo de rectificación y Nota de Crédito está aceptado;
- el módulo estadístico cubre las necesidades de gerencia;
- las exclusiones de V1 son aceptadas.

Las cuestiones técnicas no resueltas deberán derivarse al documento correspondiente y no ser improvisadas durante implementación.

---

# 88. Documentos derivados

Una vez aprobado este PRD deberán elaborarse o actualizarse:

1. **Documento de Diseño Funcional y UX**
2. **Documento de Arquitectura de Solución**
3. **Modelo de Dominio y Diseño de Base de Datos**
4. **Especificación Técnica y Contratos de Aplicación/API**
5. **Matriz de Roles y Permisos**
6. **Plan de Implementación**
7. **Plan de Pruebas y Criterios de Aceptación**
8. **Manifiesto de Implementación para IA**

Todos deberán considerar explícitamente precios IVA incluido, cálculo neto, cuadratura, rectificación, Nota de Crédito y cadena documental.

---

# 89. Regla para la implementación mediante IA

Este PRD será considerado una fuente funcional autoritativa del proyecto.

Antigravity u otra IA encargada de implementación:

- no deberá ampliar alcance unilateralmente;
- no deberá cambiar reglas funcionales sin aprobación;
- no deberá sustituir decisiones aprobadas por preferencias propias;
- no deberá inventar nuevos flujos cuando exista ambigüedad;
- deberá respetar la inmutabilidad de facturas emitidas;
- deberá respetar que el solicitante sólo trabaja con precios IVA incluido;
- deberá aplicar las reglas de rectificación y contabilización establecidas en esta versión.

Cuando exista una contradicción, vacío relevante o decisión no definida, deberá registrarse y elevarse para resolución en el documento técnico correspondiente en lugar de improvisarse durante la implementación.

---

# 90. Estado del documento consolidado

**Resultado:** PRD v1.1 CONSOLIDADO

Este documento incorpora en una sola fuente:

- el contenido funcional del PRD v1.0;
- las reglas de precios IVA incluido;
- el cálculo automático de netos;
- la validación de cuadratura con SII;
- la inmutabilidad de facturas realizadas;
- el proceso de rectificación;
- el registro de Notas de Crédito;
- la generación de nueva factura corregida;
- el impacto estadístico;
- las reglas RN-021 a RN-034;
- las historias US-010 a US-012.

A partir de su aprobación, este documento deberá utilizarse como **PRD rector único del Sistema de Gestión de Facturas Maxiofertas**.
