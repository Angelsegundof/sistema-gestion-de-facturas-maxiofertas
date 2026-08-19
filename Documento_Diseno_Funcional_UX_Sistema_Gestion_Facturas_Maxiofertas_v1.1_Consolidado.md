# Documento de Diseño Funcional y UX — Sistema de Gestión de Facturas Maxiofertas

**Proyecto:** Sistema de Gestión de Facturas Maxiofertas  
**Tipo de documento:** Diseño Funcional y UX  
**Versión:** 1.1 — Consolidada  
**Estado:** Propuesta consolidada para revisión y aprobación  
**Fecha:** 19 de agosto de 2026  
**Responsable funcional:** Ángel Ferrer  
**Rol responsable del documento:** Product Designer / UX Designer  
**Documento rector:** PRD — Sistema de Gestión de Facturas Maxiofertas v1.1  
**Implementación prevista:** Antigravity  
**Organización:** Maxiofertas

---

## Control de versión

| Versión | Fecha | Descripción |
|---|---|---|
| 1.0 | 19-08-2026 | Documento inicial de Diseño Funcional y UX. |
| 1.1 | 19-08-2026 | Integración de precios IVA incluido, cálculo de netos para SII, cuadratura y rectificación de facturas mediante Nota de Crédito. |

### Autoridad documental

Este documento sustituye funcionalmente al Documento de Diseño Funcional y UX v1.0 y a la actualización separada v1.1.

Las reglas incorporadas en la v1.1 prevalecen sobre cualquier comportamiento anterior incompatible, especialmente aquellos que pudieran implicar:

- ingreso de precios netos por parte de la bodega;
- edición directa de una factura ya realizada;
- sustitución silenciosa de PDFs;
- corrección de una factura tributaria sin registrar previamente una Nota de Crédito;
- finalización de una factura sin comprobar su cuadratura.

---

# 1. Propósito del documento

Este documento define cómo deberá comportarse y presentarse el Sistema de Gestión de Facturas Maxiofertas desde la perspectiva del usuario.

Su objetivo principal es asegurar que el sistema:

- sea extremadamente simple;
- utilice lenguaje claro;
- reduzca al mínimo los pasos;
- pueda ser entendido por usuarios con poca experiencia digital;
- minimice errores;
- guíe al usuario;
- facilite el trabajo repetitivo;
- evite depender de capacitaciones extensas;
- funcione correctamente según el dispositivo utilizado;
- mantenga separados los conceptos visibles para solicitantes y ejecutores;
- permita gestionar rectificaciones sin perder trazabilidad documental.

El diseño debe asumir que algunos usuarios pueden:

- no estar familiarizados con sistemas administrativos;
- confundirse con términos técnicos;
- no comprender conceptos como estados, filtros, workflows o registros;
- utilizar principalmente el teléfono;
- cometer errores de digitación;
- requerir instrucciones explícitas.

Por tanto, el sistema deberá priorizar:

**claridad antes que densidad de información.**

---

# 2. Principio central de UX

El sistema deberá seguir esta regla:

> **Cada pantalla debe dejar claro qué está pasando y cuál es el siguiente paso.**

El usuario nunca debería preguntarse:

- ¿qué hago ahora?
- ¿dónde tengo que apretar?
- ¿esto se guardó?
- ¿esta factura ya está lista?
- ¿quién la está haciendo?
- ¿por qué no puedo continuar?
- ¿qué significa este estado?
- ¿el precio que debo escribir incluye IVA?
- ¿qué valor debo copiar al SII?
- ¿la factura anterior quedó anulada o sigue vigente?

---

# 3. Filosofía de diseño

El sistema no deberá parecer:

- una planilla;
- un ERP complejo;
- un software contable;
- un panel técnico;
- una base de datos.

Deberá parecer una herramienta simple de trabajo diario.

La lógica visual debe ser:

```text
Ver lo pendiente
↓
Hacer una acción
↓
Confirmar resultado
↓
Pasar a lo siguiente
```

Para rectificaciones:

```text
Ver el cambio solicitado
↓
Registrar Nota de Crédito
↓
Generar nueva factura
↓
Finalizar corrección
```

---

# 4. Tipos de usuarios

## 4.1 Solicitante de factura

Dispositivo principal:

- teléfono móvil;
- computador.

Objetivo:

> Crear una solicitud rápida y revisar su estado.

Debe utilizar el mínimo número posible de pasos.

El solicitante **no debe conocer ni trabajar con cálculos tributarios**.

Su experiencia deberá reflejar la forma natural en que conoce los precios:

> **El precio que escribo es el precio final que pagó el cliente.**

Por tanto, nunca deberá ingresar ni visualizar:

- precio neto;
- IVA unitario;
- IVA total;
- porcentaje de IVA;
- subtotal neto;
- base imponible.

---

## 4.2 Ejecutor de facturas

Dispositivo obligatorio:

**computador de escritorio o notebook.**

Objetivo:

> Ver lo pendiente, tomar una solicitud, copiar datos, emitir la factura, comprobar el total, subir el PDF y finalizar.

El diseño debe priorizar:

- velocidad;
- lectura;
- copiar/pegar;
- trabajo continuo;
- mínima navegación;
- prevención de errores;
- claridad entre precio solicitado y precio neto para SII;
- gestión explícita de rectificaciones.

---

## 4.3 Jefatura / Gerencia

Dispositivos:

### Computador

Para:

- revisar toda la operación;
- consultar solicitudes;
- analizar detalle;
- filtrar;
- supervisar;
- revisar rectificaciones y anulaciones.

### Teléfono

Principalmente para:

- estadísticas;
- indicadores;
- resumen ejecutivo.

La experiencia móvil de jefatura deberá ser especialmente simple y orientada a indicadores.

---

# 5. Matriz de dispositivos

| Función | Teléfono | Computador |
|---|---:|---:|
| Crear solicitud | Sí | Sí |
| Consultar solicitudes propias | Sí | Sí |
| Corregir observadas | Sí | Sí |
| Solicitar cambio de factura realizada | Sí | Sí |
| Gestionar facturas | No recomendado | Sí |
| Tomar solicitud | No | Sí |
| Generar factura | No | Sí |
| Validar total SII | No | Sí |
| Gestionar rectificación | No | Sí |
| Subir PDF | No | Sí |
| Gestión administrativa | Limitada | Sí |
| Estadísticas | Sí | Sí |
| Supervisión detallada | Limitada | Sí |

El sistema podrá ser técnicamente responsive en todas las vistas, pero deberá respetar esta prioridad funcional.

---

# 6. Lenguaje del sistema

Todo el sistema deberá estar en español.

Debe evitarse terminología técnica.

## No utilizar frente al usuario

```text
workflow
ticket
request
endpoint
status
record
database
upload
dashboard
lock
transaction
ID interno
```

## Utilizar

```text
Solicitud
Factura
Pendiente
En proceso
Necesita corrección
Lista
Cancelar
Subir factura
Copiar
Ver factura
Solicitar cambio
Factura corregida
```

---

# 7. Terminología oficial visible

| Estado técnico | Texto visible |
|---|---|
| PENDIENTE | Pendiente |
| EN_PROCESO | En proceso |
| OBSERVADA | Necesita corrección |
| REALIZADA | Lista / Factura lista |
| CANCELADA | Cancelada |
| DUPLICADA | Duplicada |
| RECTIFICACION_SOLICITADA | Cambio solicitado |
| RECTIFICACION_EN_PROCESO | Corrigiendo factura |
| RECTIFICADA | Factura corregida |

Se evita mostrar la palabra **OBSERVADA**, porque puede ser poco intuitiva para usuarios básicos.

En rectificaciones, el solicitante verá lenguaje simple:

```text
Solicitar cambio
Factura anterior anulada
Factura corregida
```

El ejecutor sí podrá ver:

```text
Nota de Crédito
Precio neto
IVA
```

porque estos conceptos forman parte de su trabajo.

---

# 8. Navegación general

La navegación deberá ser mínima.

## Solicitante

```text
Inicio
Solicitar factura
Mis solicitudes
```

Dentro de `Mis solicitudes` deberán distinguirse:

```text
Pendientes
En proceso
Necesitan corrección
Realizadas
Cambios solicitados
```

## Ejecutor

```text
Pendientes
En proceso
Cambios solicitados
Necesitan corrección
Listas
```

## Jefatura

```text
Resumen
Solicitudes
Estadísticas
```

## Administrador

Podrá existir navegación adicional para:

```text
Usuarios
Bodegas
Configuración
Auditoría
```

pero separada de las funciones normales.

---

# 9. Entrada desde Hub Maxiofertas

En el Hub deberá existir una opción grande y clara:

**🧾 Facturación**

Al entrar, el sistema deberá identificar el rol automáticamente.

El usuario no deberá seleccionar:

> “¿Qué tipo de usuario eres?”

El sistema ya debe saberlo.

---

# 10. Pantalla inicial — Solicitante

El usuario deberá ver algo similar a:

```text
Facturación

[ + Solicitar factura ]

Mis solicitudes

1 necesita corrección
3 pendientes
2 en proceso
18 realizadas
1 cambio solicitado
```

No mostrar estadísticas complejas.

---

# 11. Acción principal del solicitante

El botón principal deberá ser:

**Solicitar factura**

Debe ser:

- visible inmediatamente;
- grande;
- accesible con el pulgar en móvil;
- no escondido en menú.

---

# 12. Formulario de solicitud

El formulario debe mostrarse en una sola pantalla cuando sea razonable.

En móvil podrá dividirse visualmente en bloques, pero no como un asistente de cinco pasos.

El objetivo es:

> llenar y enviar.

---

# 13. Orden recomendado del formulario

## Datos del cliente

```text
RUT *
Razón social *
Giro *
Teléfono
Correo
```

## Productos

Cada producto deberá mostrarse como línea estructurada y simple.

Ejemplo:

```text
Producto
[ Toldo con estructura ]

Cantidad
[ 2 ]

Precio por unidad
IVA incluido
$ [ 28.000 ]

Total producto
$56.000
```

Deberá existir opción para agregar más productos cuando corresponda.

## Total

```text
TOTAL A FACTURAR

$68.000

Todos los precios incluyen IVA.
```

## Información interna

```text
Bodega *
Solicitante
Observaciones
```

---

# 14. Principio UX para precios

El solicitante no deberá conocer ni entender cálculos tributarios.

El sistema deberá transmitir claramente:

> **Ingresa el precio final que pagó el cliente. El valor ya debe incluir IVA.**

Este texto deberá aparecer como ayuda permanente o contextual cerca del precio.

---

# 15. No utilizar en la experiencia del solicitante

Nunca mostrar:

```text
Precio neto
Subtotal neto
IVA 19%
Base imponible
Precio sin IVA
```

---

# 16. Bodega

Si el usuario pertenece a una sola bodega:

**no preguntarla.**

Debe venir seleccionada automáticamente.

Ejemplo:

```text
Bodega
Santiago
```

sin posibilidad de cambio si no corresponde.

Si pertenece a varias bodegas, entonces sí se mostrará selector.

---

# 17. Solicitante

El nombre del solicitante debe obtenerse automáticamente del usuario autenticado.

No pedir que escriba su nombre.

Esto evita errores como:

```text
Araceli
ARACELI C
Aracely
Araceli C.
```

---

# 18. Campo RUT

Debe ser uno de los campos más cuidados.

Ejemplo:

```text
RUT del cliente
[ 76.123.456-7 ]
```

Al salir del campo:

- validar formato;
- buscar cliente existente;
- completar datos cuando corresponda.

---

# 19. Cliente existente

Si el RUT ya existe:

Mostrar:

```text
Encontramos este cliente

Comercial Ejemplo SPA
Giro: Venta de artículos
Teléfono: 9 1234 5678

[Usar estos datos]
```

El sistema podrá completar automáticamente.

---

# 20. Datos posiblemente desactualizados

Debe existir una acción simple:

**Editar datos**

No utilizar:

> Actualizar registro maestro.

---

# 21. Cliente nuevo

Si no se encuentra:

Mostrar discretamente:

```text
Cliente nuevo
Completa sus datos para continuar.
```

No mostrar errores por no encontrarlo.

---

# 22. Productos

Los productos deberán gestionarse como líneas estructuradas.

Ejemplo:

```text
Producto
[ Toldo con estructura ]

Cantidad
[ 2 ]

Precio por unidad
IVA incluido
$ [ 28.000 ]

Total producto
$56.000
```

El total de cada línea deberá calcularse automáticamente.

El solicitante no deberá realizar cálculos tributarios ni separar IVA.

---

# 23. Total

Mostrar:

```text
TOTAL A FACTURAR

$68.000

Todos los precios incluyen IVA.
```

El sistema deberá dar formato de moneda automáticamente.

Evitar que el usuario tenga que escribir puntos.

---

# 24. Validaciones

Las validaciones deberán mostrarse cerca del campo.

Ejemplo:

```text
RUT
[ 7612345 ]

Revisa el RUT. Parece estar incompleto.
```

No utilizar mensajes como:

```text
Invalid input
Validation failed
Error 422
```

También deberá validarse coherencia entre:

- cantidad;
- precio unitario con IVA;
- total por producto;
- total de solicitud.

---

# 25. Botón de envío

Al final:

**Enviar solicitud**

No:

```text
Guardar
Procesar
Enviar registro
Confirmar operación
```

---

# 26. Confirmación de solicitud

Después del envío:

```text
✓ Solicitud enviada

Número:
FAC-2026-001842

Bodega:
Santiago

Total:
$68.000

La solicitud quedó pendiente de facturación.
```

Acciones:

```text
[ Ver solicitud ]
[ Solicitar otra factura ]
```

---

# 27. Detección de duplicado

La advertencia debe ser comprensible.

Mostrar:

```text
⚠ Esta solicitud se parece a otra reciente

FAC-2026-001839
Cliente: Comercial Ejemplo SPA
Total: $68.000
Enviada hace 15 minutos
Estado: Pendiente
```

Opciones:

```text
[ Ver solicitud anterior ]

[ No enviar ]

[ Enviar de todas maneras ]
```

El botón de continuar debe ser menos destacado que el de revisar.

---

# 28. Confirmación al ignorar duplicado

Si pulsa:

**Enviar de todas maneras**

mostrar:

```text
¿Seguro que necesitas una nueva factura?

Ya existe una solicitud parecida.

[ Volver ]
[ Sí, enviar otra solicitud ]
```

---

# 29. Mis solicitudes — móvil

Debe ser una lista tipo tarjeta.

Ejemplo:

```text
FAC-2026-001842
Comercial Ejemplo SPA
$68.000

Pendiente
Hace 18 min

[ Ver ]
```

No usar tablas horizontales en teléfono.

---

# 30. Estados visuales para solicitante

## Pendiente

```text
Pendiente
Tu solicitud está esperando ser procesada.
```

## En proceso

```text
En proceso
Ya están preparando tu factura.
```

## Necesita corrección

```text
Necesita corrección
Debes revisar algunos datos.
```

## Realizada

```text
Factura lista
Ya puedes abrirla.
```

## Cambio solicitado

```text
Cambio solicitado
El equipo revisará la factura emitida.
```

## Corrigiendo factura

```text
Corrigiendo factura
La factura está siendo corregida.
```

## Factura corregida

```text
Factura corregida
La nueva factura ya está disponible.
```

---

# 31. Secciones de solicitudes del solicitante

La pantalla principal deberá distinguir:

```text
Mis solicitudes

Pendientes
Necesitan corrección
Realizadas
```

`En proceso` podrá mostrarse como sección propia cuando sea útil.

`Necesitan corrección` deberá tener prioridad visual cuando existan elementos.

---

# 32. Solicitud que necesita corrección

Ejemplo:

```text
Esta solicitud necesita una corrección

Motivo:
El RUT ingresado no es válido.

RUT actual:
76.123.456-5

[ Corregir ahora ]
```

Después:

```text
Nuevo RUT
[ __________ ]

[ Guardar y reenviar ]
```

---

# 33. Factura realizada

Una factura realizada deberá mostrarse como cerrada.

No mostrar:

**Editar**

Mostrar:

```text
✓ Factura lista

[ Ver factura ]

¿Encontraste un error?

[ Solicitar cambio ]
```

---

# 34. Solicitar cambio

Al pulsar:

**Solicitar cambio**

mostrar:

```text
¿Qué está incorrecto en la factura?
```

Opciones:

```text
RUT
Razón social
Giro
Producto
Cantidad
Precio
Total
Otro
```

---

# 35. Explicación del cambio

Luego:

```text
Cuéntanos qué debe corregirse

[________________________________]

[________________________________]

[ Enviar solicitud de cambio ]
```

---

# 36. Advertencia antes de solicitar cambio

Mostrar:

> La factura ya fue emitida y no puede editarse directamente. El equipo de facturación deberá anularla y emitir una nueva.

No utilizar expresiones tributarias complejas frente al solicitante salvo necesidad.

---

# 37. Confirmación de cambio solicitado

Después:

```text
✓ Cambio solicitado

El equipo de facturación revisará la factura y realizará la corrección necesaria.

Puedes revisar el estado desde Mis solicitudes.
```

---

# 38. Historial sencillo del solicitante

El solicitante no necesita auditoría técnica.

Mostrar una línea de tiempo simple:

```text
10 ago
Solicitud enviada

12 ago
Factura realizada

13 ago
Cambio solicitado

13 ago
Factura anterior anulada

13 ago
Nueva factura realizada
```

---

# 39. No mostrar información innecesaria

Al solicitante no le interesa:

- logs;
- usuario asignado interno;
- IDs técnicos;
- tiempos de base de datos;
- auditoría;
- datos del almacenamiento;
- cálculos tributarios internos.

Debe ver sólo lo necesario.

---

# 40. Pantalla principal — Ejecutor

Esta es la pantalla más importante del sistema.

El ejecutor trabaja desde computador.

Al iniciar:

```text
Facturas pendientes

12 pendientes
3 en proceso
2 necesitan corrección
3 cambios solicitados
41 listas hoy
```

Debajo:

**la cola de trabajo.**

---

# 41. Navegación del ejecutor

Deberá incorporar:

```text
Pendientes
En proceso
Cambios solicitados
Necesitan corrección
Listas
```

`Cambios solicitados` deberá mostrar contador cuando existan casos.

Ejemplo:

```text
Cambios solicitados  3
```

---

# 42. Cola de pendientes

La lista deberá ordenarse automáticamente:

**más antigua primero.**

No depender de que el usuario ordene columnas.

---

# 43. Columnas recomendadas

```text
Tiempo
Bodega
Cliente
RUT
Total
Solicitante
Acción
```

Ejemplo:

| Esperando | Bodega | Cliente | Total | Acción |
|---|---|---|---:|---|
| 2 h 18 min | Santiago | Comercial ABC | $125.000 | Tomar |
| 1 h 04 min | Osorno | Juan Pérez | $62.000 | Tomar |
| 18 min | Temuco | Empresa XYZ | $84.000 | Tomar |

---

# 44. Prioridad visual

El tiempo debe ser muy visible.

Ejemplo:

```text
🔴 2 h 18 min
🟠 1 h 04 min
🟢 18 min
```

El color sólo sirve como ayuda.

Nunca debe depender exclusivamente del color.

---

# 45. Acción “Tomar”

Cada fila debe tener:

**Tomar**

Al pulsarlo:

- asigna la solicitud;
- pasa a En proceso;
- abre la pantalla de trabajo.

No solicitar confirmación innecesaria.

---

# 46. Evitar doble procesamiento

Si otro ejecutor la tomó antes:

```text
Esta solicitud ya está siendo procesada por:

María Pérez

Puedes volver a las facturas pendientes.
```

Botón:

**Volver a pendientes**

---

# 47. Pantalla de trabajo del ejecutor

Debe estar diseñada como una **mesa de trabajo**.

No como formulario editable completo.

Dividir en tres áreas:

```text
1. Datos para facturar
2. Resultado / cuadratura
3. Finalizar
```

---

# 48. Encabezado de solicitud

Ejemplo:

```text
FAC-2026-001842

En proceso

Santiago
Solicitada hace 42 min
```

---

# 49. Bloque “Datos para facturar”

Debe mostrar:

```text
RUT
76.123.456-7      [Copiar]

Razón social
COMERCIAL EJEMPLO SPA      [Copiar]

Giro
VENTA AL POR MENOR      [Copiar]
```

Para cada producto:

```text
Toldo con estructura

Cantidad
2

Precio con IVA
$28.000

Precio neto para SII
$23.529      [Copiar]
```

La interfaz deberá diferenciar claramente:

```text
PRECIO SOLICITADO
```

y:

```text
PRECIO PARA COPIAR AL SII
```

---

# 50. Copiar sin confusión

El botón deberá estar pegado al dato correspondiente.

Ejemplo correcto:

```text
Precio neto para SII

$23.529          [Copiar]
```

Al pulsar:

```text
✓ Precio neto copiado
```

No utilizar un único botón ambiguo que copie varios precios.

---

# 51. Copiar todo

Debe existir además:

**Copiar datos principales**

Esto podrá copiar una estructura ordenada para apoyo del ejecutor.

---

# 52. No pedir al ejecutor que calcule

El ejecutor nunca debería abrir calculadora para:

```text
precio / 1,19
```

El sistema debe calcular automáticamente el neto.

---

# 53. Total esperado

La mesa del ejecutor deberá mantener siempre visible:

```text
TOTAL QUE DEBE DAR EN SII

$68.000
```

Este dato deberá tener fuerte jerarquía visual.

---

# 54. Acceso al SII

Podrá existir:

**Abrir SII**

Debe abrir una nueva pestaña.

El sistema no deberá intentar automatizar el acceso en V1.

---

# 55. Mantener solicitud visible

Cuando se abra SII en otra pestaña, la pantalla de Maxiofertas debe conservar la solicitud.

El ejecutor debe poder alternar fácilmente entre:

```text
Maxiofertas
SII
```

---

# 56. Flujo de cuadratura

Después de ingresar los productos en SII:

```text
¿El total del SII coincide?

Total esperado:
$68.000

Total mostrado por SII:
$ [____________]
```

## Si coincide

```text
✓ Los valores coinciden.
```

## Si no coincide

```text
⚠ Los valores no coinciden

Solicitud:
$68.000

SII:
$67.999

Revisa los precios netos antes de continuar.
```

---

# 57. Diferencias

Ante una diferencia, la pantalla debe ayudar, no sólo bloquear.

Debe mantener visibles:

- cantidad;
- precio con IVA;
- neto calculado;
- total esperado.

El ejecutor deberá poder volver fácilmente a revisar los datos.

---

# 58. Problema con datos

Debe existir:

**Hay un problema con los datos**

No utilizar:

> Cambiar a observada.

---

# 59. Flujo de corrección desde ejecutor

Al pulsar:

**Hay un problema con los datos**

mostrar:

```text
¿Qué necesita corregirse?

( ) RUT
( ) Razón social
( ) Giro
( ) Total
( ) Productos
( ) Precio
( ) Falta información
( ) Otro
```

Después:

```text
Escribe una explicación breve
[________________________]

[ Enviar para corrección ]
```

---

# 60. Mensaje de confirmación

```text
Solicitud enviada para corrección.

El solicitante podrá corregirla y reenviarla.
```

---

# 61. Carga del PDF

La zona de carga deberá ser grande.

```text
Factura generada

Arrastra aquí el PDF de la factura

o

[ Seleccionar archivo ]
```

---

# 62. Archivo cargado

Después:

```text
✓ Factura cargada correctamente

FAC-2026-001842_76123456-7.pdf
324 KB

[ Ver factura ]
[ Reemplazar ]
```

---

# 63. Error al subir PDF

```text
No pudimos subir este archivo.

Sólo se permiten archivos PDF de hasta 2 MB.

[ Intentar nuevamente ]
```

---

# 64. Finalización

Después de cargar el documento y validar cuadratura:

```text
Todo listo para finalizar

Cliente:
Comercial Ejemplo SPA

Total esperado:
$68.000

Total SII:
$68.000

✓ Los valores coinciden

Factura:
✓ PDF cargado
```

Botón principal:

**Finalizar factura**

Si existe una diferencia no resuelta, la pantalla deberá impedir la finalización normal o exigir una excepción administrativa auditada.

---

# 65. Confirmación posterior

```text
✓ Factura finalizada

FAC-2026-001842
Comercial Ejemplo SPA
$68.000
```

Y mostrar inmediatamente el mensaje al cliente.

---

# 66. Mensaje al cliente

Ejemplo:

```text
Mensaje para el cliente

Hola, anexo factura solicitada.

RUT: 76.123.456-7
Razón Social: Comercial Ejemplo SPA
Total facturado: $68.000

Factura:
https://...

Gracias.
```

Acciones:

```text
[ Copiar mensaje ]

[ Abrir WhatsApp ]
```

---

# 67. Acción posterior

Después de cerrar una factura:

**Ir a la siguiente pendiente**

Esto es clave para productividad.

---

# 68. Flujo continuo del ejecutor

```text
Tomar
↓
Copiar datos
↓
Abrir SII
↓
Ingresar netos
↓
Comprobar total
↓
Subir PDF
↓
Finalizar
↓
Copiar / WhatsApp
↓
Siguiente
```

---

# 69. Pantalla “En proceso”

Mostrar sólo solicitudes actualmente asignadas.

Campos:

```text
Solicitud
Cliente
Bodega
Ejecutor
Tiempo en proceso
```

---

# 70. Solicitudes abandonadas

Si una solicitud permanece en proceso demasiado tiempo:

```text
En proceso hace 3 h 18 min
Ejecutor: María
```

La reasignación será función administrativa.

---

# 71. Cambios solicitados — ejecutor

Las rectificaciones no deben mezclarse silenciosamente con facturas nuevas.

Cada caso deberá identificarse claramente como:

```text
CAMBIO DE FACTURA
```

Ejemplo:

```text
CAMBIO DE FACTURA

FAC-2026-001801

Comercial ABC SPA
Factura original: $125.000

Motivo:
Precio incorrecto

Solicitado hace 28 min

[ Revisar cambio ]
```

---

# 72. Acción sobre rectificación

No utilizar el mismo botón `Tomar` sin contexto.

Utilizar:

**Revisar cambio**

y luego:

**Tomar corrección**

Esto reduce confusión.

---

# 73. Pantalla de rectificación

Encabezado:

```text
CORRECCIÓN DE FACTURA

FAC-2026-001801

Esta factura ya fue emitida.
Para corregirla debes registrar primero la Nota de Crédito.
```

---

# 74. Bloque factura original

```text
Factura original

Cliente
Comercial ABC SPA

RUT
76.123.456-7

Total
$125.000

Emitida
12 ago 2026

[ Ver factura original ]
```

---

# 75. Bloque cambio solicitado

```text
Cambio solicitado

Precio incorrecto

El producto Toldo con estructura
debía facturarse en $28.000 y no $30.000.
```

---

# 76. Flujo visual de rectificación

La pantalla deberá mostrar tres etapas claras:

```text
1. Nota de Crédito
2. Nueva factura
3. Finalizar
```

No usar un wizard complejo.

Pueden mostrarse verticalmente en la misma pantalla.

---

# 77. Etapa 1 — Nota de Crédito

```text
1. Nota de Crédito

Genera la Nota de Crédito en el SII.

[ Abrir SII ]

Cuando esté lista:

Folio
[____________]

Arrastra el PDF aquí
[ Seleccionar archivo ]

[ Registrar Nota de Crédito ]
```

---

# 78. Después de registrar Nota de Crédito

```text
✓ Nota de Crédito registrada

La factura original quedó marcada como anulada.

Ahora genera la nueva factura.
```

---

# 79. Factura original anulada

En cualquier consulta posterior:

```text
Factura original

⚠ Anulada mediante Nota de Crédito

[ Ver factura ]
[ Ver Nota de Crédito ]
```

Nunca utilizar simplemente:

**Cancelada**

porque debe quedar claro que sí existió una factura tributaria.

---

# 80. Etapa 2 — nueva factura

Mostrar los datos corregidos.

Ejemplo:

```text
2. Nueva factura

DATOS CORREGIDOS

Producto
Toldo con estructura

Cantidad
2

Precio con IVA
$28.000

Precio neto para SII
$23.529    [Copiar]

TOTAL QUE DEBE DAR EN SII
$56.000
```

---

# 81. Diferencias con datos anteriores

Cuando sea útil:

```text
Antes:
$30.000

Ahora:
$28.000
```

Esto ayuda a evitar repetir el mismo error.

---

# 82. Cuadratura de la nueva factura

La nueva factura deberá aplicar el mismo flujo de cuadratura que una factura inicial:

```text
Total esperado:
$56.000

Total mostrado por SII:
$ [____________]
```

Si coincide:

```text
✓ Los valores coinciden.
```

Si no coincide:

```text
⚠ Los valores no coinciden.
Revisa los precios netos antes de continuar.
```

---

# 83. Carga de nueva factura

```text
Nueva factura

Arrastra aquí el PDF

[ Seleccionar archivo ]
```

Después:

```text
✓ Nueva factura cargada
```

---

# 84. Finalizar rectificación

Mostrar resumen:

```text
Todo listo

Factura original
✓ Anulada

Nota de Crédito
✓ Registrada

Nueva factura
✓ Cargada

Cuadratura
✓ Validada

[ Finalizar corrección ]
```

---

# 85. Resultado para ejecutor

```text
✓ Factura corregida

La factura anterior quedó anulada y la nueva factura está lista.

[ Copiar mensaje ]
[ Abrir WhatsApp ]
[ Ir a la siguiente ]
```

---

# 86. Resultado para solicitante

```text
✓ Factura corregida

Nueva factura
[ Ver factura ]

Factura anterior
Anulada mediante Nota de Crédito

[ Ver historial ]
```

---

# 87. Mensaje al cliente después de rectificación

Ejemplo:

```text
Hola, enviamos la factura corregida correspondiente a tu compra.

RUT: 76.123.456-7
Razón Social: Comercial ABC SPA
Total facturado: $56.000

Nueva factura:
[enlace]

La factura anterior fue anulada.
```

El texto definitivo podrá configurarse.

---

# 88. Jefatura — experiencia escritorio

La pantalla inicial deberá ser un resumen ejecutivo.

No comenzar con una tabla gigante.

---

# 89. Dashboard de jefatura

Primera sección:

```text
Facturación este mes

Facturado vigente
$119.000.000

IVA débito estimado
$19.000.000

Neto estimado
$100.000.000

Facturas vigentes
1.842
```

Cuando corresponda:

```text
Facturación bruta emitida
Notas de crédito
Facturas rectificadas
```

---

# 90. Segunda sección

```text
Operación actual

Pendientes      12
En proceso       3
Necesitan corrección 2
Cambios solicitados 3
Listas hoy      41
```

---

# 91. Tercera sección

Gráfico:

**Facturación mensual**

Debe ser simple.

No incluir gráficos complejos si no responden preguntas reales.

---

# 92. Cuarta sección

**Facturación por bodega**

Ejemplo:

```text
Santiago        $32,4 M
Antofagasta     $11,8 M
Concepción       $9,6 M
Temuco           $8,7 M
```

---

# 93. Jefatura — móvil

Al abrir:

```text
Facturación — Agosto

$119.000.000
Facturado vigente

$19.000.000
IVA débito estimado

1.842
Facturas
```

Debajo:

```text
Pendientes: 12
En proceso: 3
Cambios solicitados: 3
```

Luego:

**Ver por bodega**

---

# 94. Filtro de período en móvil

```text
[ Agosto 2026 ▼ ]
```

Opción adicional:

**Elegir otro período**

---

# 95. No sobrecargar estadísticas móviles

No mostrar simultáneamente:

- diez gráficos;
- veinte indicadores;
- tablas;
- filtros avanzados.

La prioridad es responder:

> ¿Cuánto llevamos facturado vigente?

> ¿Cuánto IVA se ha generado aproximadamente?

> ¿Cuántas facturas hay?

> ¿Cómo van las bodegas?

---

# 96. Estadísticas y facturas anuladas

Jefatura deberá poder distinguir, cuando corresponda:

```text
Facturado vigente
Notas de crédito
Facturas rectificadas
```

No es necesario mostrar este detalle en la portada móvil si complica la lectura.

El indicador principal deberá reflejar la facturación vigente según las reglas funcionales aprobadas.

---

# 97. Estados visuales

Los estados deberán tener texto + color + icono opcional.

Nunca sólo color.

Ejemplo:

```text
🟡 Pendiente
🔵 En proceso
🟠 Necesita corrección
🟢 Lista
⚪ Cancelada
⚫ Duplicada
🟣 Cambio solicitado
🟦 Corrigiendo factura
✅ Factura corregida
```

La paleta final será definida durante implementación visual.

---

# 98. Botones

Máximo recomendado por zona:

**1 acción principal + 1 o 2 secundarias.**

Ejemplo correcto:

```text
[ Finalizar factura ]

[ Hay un problema ]
```

Evitar saturación de acciones.

---

# 99. Jerarquía de botones

## Principal

Acción esperada para continuar.

Ejemplo:

**Enviar solicitud**

## Secundario

Acción válida pero no principal.

Ejemplo:

**Volver**

## Riesgo

Acciones como cancelar deberán estar menos destacadas.

---

# 100. Confirmaciones

No pedir confirmación para acciones reversibles o normales.

Sí pedir para:

- cancelar solicitud;
- ignorar duplicado;
- reemplazar factura;
- solicitar rectificación cuando implique iniciar un proceso irreversible;
- acciones administrativas delicadas.

---

# 101. Mensajes de éxito

Ejemplos:

```text
✓ Solicitud enviada
✓ Cambios guardados
✓ Precio neto copiado
✓ Los valores coinciden
✓ Factura cargada
✓ Factura finalizada
✓ Cambio solicitado
✓ Nota de Crédito registrada
✓ Factura corregida
✓ Mensaje copiado
```

---

# 102. Mensajes de error

Deben explicar:

1. qué pasó;
2. qué debe hacer.

Ejemplo:

```text
No pudimos guardar la solicitud.

Revisa tu conexión e intenta nuevamente.
```

---

# 103. Evitar pérdida de información

Si el usuario ha completado un formulario y ocurre un error temporal, el sistema debería conservar los campos siempre que técnicamente sea viable.

No obligar a volver a escribir todo.

---

# 104. Formularios

Reglas:

- etiqueta arriba;
- campo grande;
- ejemplo cuando sea necesario;
- error debajo;
- nunca depender sólo de placeholder.

---

# 105. Accesibilidad

Considerar:

- contraste suficiente;
- tamaño legible;
- botones con área táctil adecuada;
- navegación mediante teclado en escritorio;
- textos comprensibles;
- no depender exclusivamente del color.

---

# 106. Tamaño de texto

Móvil:

- cuerpo mínimo recomendado: 16 px;
- botones claramente legibles.

Escritorio:

- evitar texto demasiado pequeño por mostrar más información.

---

# 107. Diseño de tablas en escritorio

Las tablas deben ser simples.

No incluir columnas que el usuario no utiliza.

El detalle completo se mostrará al abrir la solicitud.

---

# 108. Tablas en móvil

No deberán mostrarse tablas anchas con desplazamiento horizontal para las tareas principales.

Transformar a tarjetas.

---

# 109. Búsqueda

En escritorio:

```text
Buscar por RUT, cliente o solicitud
[____________________________]
```

Una sola caja inicialmente.

---

# 110. Filtros

Los filtros deberán ser personales.

Ejemplo:

```text
Bodega: Todas
Estado: Pendiente
Período: Hoy
```

Nunca modificarán la vista de otros usuarios.

---

# 111. Filtros predeterminados del ejecutor

Al entrar:

```text
Estado: Pendiente
Orden: Más antigua primero
```

El usuario no necesita configurar esto.

---

# 112. Pantallas vacías

Si no hay pendientes:

```text
✓ No hay facturas pendientes

Todo está al día.
```

No mostrar una tabla vacía sin explicación.

---

# 113. Primera experiencia

El sistema debe poder utilizarse sin tutorial largo.

Podrán incluirse textos pequeños de ayuda.

Ejemplo:

```text
Facturas pendientes

Aquí aparecen las solicitudes que todavía no han sido procesadas.
La más antigua aparece primero.
```

---

# 114. Ayuda contextual

Utilizar pequeñas ayudas cerca de acciones complejas.

No crear un manual dentro de cada pantalla.

---

# 115. Flujo del solicitante

```text
Hub
↓
Facturación
↓
Solicitar factura
↓
Completar formulario con precios IVA incluido
↓
Validación
↓
Revisión de duplicado
↓
Enviar
↓
Confirmación
```

Objetivo:

**1 pantalla principal + confirmación.**

---

# 116. Flujo del ejecutor

```text
Hub
↓
Facturación
↓
Pendientes
↓
Tomar
↓
Copiar datos
↓
Abrir SII
↓
Ingresar netos
↓
Validar total
↓
Subir PDF
↓
Finalizar
↓
Copiar mensaje / WhatsApp
↓
Siguiente
```

---

# 117. Flujo de corrección de solicitud

```text
Ejecutor detecta problema
↓
Selecciona motivo
↓
Enviar para corrección
↓
Solicitante recibe estado
↓
Corrige
↓
Reenviar
↓
Vuelve a la cola
```

---

# 118. Flujo de rectificación

```text
Factura realizada
↓
Solicitante pulsa Solicitar cambio
↓
Indica qué debe corregirse
↓
Cambio solicitado
↓
Ejecutor revisa cambio
↓
Toma corrección
↓
Registra Nota de Crédito
↓
Factura original queda anulada
↓
Genera nueva factura
↓
Valida cuadratura
↓
Carga nueva factura
↓
Finaliza corrección
```

---

# 119. Flujo de jefatura móvil

```text
Hub
↓
Facturación
↓
Resumen
↓
Facturado vigente
IVA estimado
Facturas
Pendientes
Cambios solicitados
↓
Detalle por bodega
```

---

# 120. Diseño visual

El diseño deberá sentirse:

- limpio;
- corporativo;
- moderno;
- simple;
- confiable.

No requiere elementos decorativos complejos.

---

# 121. Uso de iconos

Los iconos sólo acompañarán texto.

Ejemplo:

```text
📄 Ver factura
📋 Copiar
```

No usar iconos solos cuando su significado pueda ser ambiguo.

---

# 122. Consistencia

Una misma acción debe llamarse siempre igual.

Ejemplo:

Siempre:

**Solicitar factura**

No mezclar nombres para la misma acción.

Lo mismo aplica a:

**Solicitar cambio**

**Registrar Nota de Crédito**

**Finalizar corrección**

---

# 123. Distinción importante de lenguaje

La bodega **no crea una factura**.

La bodega:

**solicita una factura.**

El ejecutor:

**gestiona la solicitud y genera la factura.**

Una factura ya emitida:

**no se edita; se corrige mediante un proceso de rectificación.**

---

# 124. Prevención de errores

El sistema debe prevenir:

- RUT incompleto;
- total vacío;
- duplicado;
- solicitud sin productos;
- precio sin IVA interpretado erróneamente;
- cantidades inválidas;
- cargar archivo incorrecto;
- cerrar sin PDF;
- cerrar con diferencia de cuadratura;
- doble procesamiento;
- nueva factura de rectificación sin Nota de Crédito registrada.

---

# 125. Edición

Una solicitud pendiente podrá ser editable según reglas definidas.

Una solicitud en proceso no deberá modificarse libremente por el solicitante.

Una factura realizada no deberá mostrar acción `Editar`.

---

# 126. Notificación visual de cambios

Si una solicitud fue corregida:

```text
Solicitud corregida

El solicitante actualizó:
• RUT
• Giro
```

cuando técnicamente sea posible.

En rectificaciones, cuando exista cambio de precio:

```text
Antes:
$30.000

Ahora:
$28.000
```

---

# 127. Administrador

Las funciones administrativas deberán estar separadas.

Un usuario normal no debe ver:

- configuración;
- auditoría;
- gestión de permisos;
- opciones de almacenamiento;
- excepciones administrativas.

---

# 128. Estadísticas financieras

En todas las pantallas se deberá usar:

**IVA débito estimado**

No:

**IVA a pagar**

El indicador principal de facturación deberá reflejar facturas vigentes.

---

# 129. Formato de moneda

Usar formato chileno consistente.

Ejemplo:

```text
$125.000
$1.250.000
```

---

# 130. Fechas

Mostrar formato comprensible:

```text
19 ago 2026
10:42
```

o:

```text
19/08/2026
10:42
```

Debe utilizarse un solo criterio en toda la aplicación.

---

# 131. Tiempo relativo

Para operación:

```text
Hace 12 min
Hace 1 h 24 min
```

es preferible a obligar al usuario a calcular diferencias.

---

# 132. Responsive — solicitante

Prioridades móviles:

1. botón Solicitar factura;
2. formulario;
3. estados;
4. correcciones;
5. facturas realizadas;
6. solicitar cambio;
7. factura corregida.

---

# 133. Responsive — ejecutor

Puede mostrar:

```text
La gestión de facturas está diseñada para computador.

Desde aquí puedes consultar información, pero para generar y finalizar facturas utiliza un computador.
```

No bloquear necesariamente toda la aplicación móvil.

---

# 134. Responsive — jefatura

Prioridades móviles:

1. facturado vigente;
2. IVA débito estimado;
3. cantidad de facturas;
4. pendientes;
5. cambios solicitados;
6. por bodega.

---

# 135. Criterios UX de éxito

## Solicitante

Debe poder:

- crear una solicitud sin capacitación formal;
- entender que todos los precios incluyen IVA;
- solicitar una corrección de factura emitida sin conocer procesos tributarios complejos.

## Ejecutor

Debe poder:

- entender qué factura debe hacer primero;
- copiar los datos correctos al SII;
- validar rápidamente el total;
- gestionar una rectificación sin confundirla con una factura nueva.

## Jefatura

Debe poder conocer la facturación vigente del mes en menos de 10 segundos desde el teléfono.

---

# 136. Métricas UX sugeridas

Medir posteriormente:

- tasa de solicitudes con error;
- tiempo promedio para crear solicitud;
- porcentaje de duplicados evitados;
- tiempo promedio del ejecutor por solicitud;
- errores de carga;
- correcciones solicitadas;
- rectificaciones;
- diferencias de cuadratura;
- uso del botón Copiar;
- uso de WhatsApp;
- abandono de formularios.

---

# 137. Reglas UX obligatorias

## UX-001
El usuario no deberá seleccionar su rol manualmente.

## UX-002
La bodega deberá completarse automáticamente cuando sea posible.

## UX-003
El solicitante deberá completarse automáticamente.

## UX-004
La acción principal deberá ser visualmente obvia.

## UX-005
Los mensajes deberán estar en español simple.

## UX-006
No deberán mostrarse códigos técnicos al usuario.

## UX-007
El ejecutor verá la solicitud más antigua primero.

## UX-008
El flujo del ejecutor se optimizará para computador.

## UX-009
El flujo del solicitante se optimizará para móvil y computador.

## UX-010
Las estadísticas de jefatura se optimizarán especialmente para móvil.

## UX-011
No deberán existir filtros globales compartidos.

## UX-012
Las tablas principales en móvil deberán convertirse en tarjetas.

## UX-013
Las acciones Copiar deberán confirmar visualmente su resultado.

## UX-014
Los errores deberán indicar cómo resolver el problema.

## UX-015
No se pedirán confirmaciones innecesarias.

## UX-016
Las acciones destructivas sí requerirán confirmación.

## UX-017
La carga de factura deberá soportar arrastrar y soltar en escritorio.

## UX-018
Después de finalizar una factura deberá existir acceso inmediato a la siguiente pendiente.

## UX-019
No deberán mostrarse términos contables o técnicos sin necesidad.

## UX-020
El sistema deberá poder entenderse sin manual extenso.

## UX-021
El solicitante sólo verá e ingresará precios con IVA incluido.

## UX-022
El solicitante nunca verá campos de precio neto.

## UX-023
El ejecutor verá precio con IVA y precio neto calculado.

## UX-024
El campo prioritario para copiar al SII será el precio neto.

## UX-025
El total esperado con IVA deberá permanecer claramente visible durante la facturación.

## UX-026
El sistema deberá advertir cuando el total del SII no coincida.

## UX-027
Una factura realizada no tendrá botón Editar.

## UX-028
Una factura realizada podrá tener `Solicitar cambio`.

## UX-029
El solicitante no deberá enfrentarse a terminología compleja de Nota de Crédito durante la solicitud de cambio.

## UX-030
El ejecutor sí tendrá un flujo explícito de Nota de Crédito.

## UX-031
Una rectificación deberá mostrar claramente tres etapas: Nota de Crédito, Nueva factura y Finalizar.

## UX-032
La factura anterior deberá permanecer visible como anulada.

## UX-033
La nueva factura deberá mostrarse como documento independiente.

## UX-034
El historial de rectificación deberá ser comprensible para usuarios no técnicos.

---

# 138. Wireframes funcionales conceptuales

## 138.1 Solicitante — móvil

```text
┌──────────────────────────┐
│ Facturación              │
│                          │
│ [+ Solicitar factura]    │
│                          │
│ Mis solicitudes          │
│                          │
│ 🟠 1 necesita corrección │
│ 🟡 3 pendientes          │
│ 🔵 2 en proceso          │
│ 🟢 18 realizadas         │
│ 🟣 1 cambio solicitado   │
└──────────────────────────┘
```

---

## 138.2 Formulario móvil actualizado

```text
┌──────────────────────────┐
│ Solicitar factura        │
│                          │
│ RUT                      │
│ [____________________]   │
│                          │
│ Razón social             │
│ [____________________]   │
│                          │
│ Giro                     │
│ [____________________]   │
│                          │
│ Producto                 │
│ [____________________]   │
│                          │
│ Cantidad                 │
│ [______]                 │
│                          │
│ Precio por unidad        │
│ IVA incluido             │
│ $ [_______________]      │
│                          │
│ Total producto           │
│ $56.000                  │
│                          │
│ TOTAL A FACTURAR         │
│ $68.000                  │
│                          │
│ Todos los precios        │
│ incluyen IVA.            │
│                          │
│ [ Enviar solicitud ]     │
└──────────────────────────┘
```

---

## 138.3 Ejecutor — escritorio

```text
┌──────────────────────────────────────────────────────┐
│ Facturas pendientes                                  │
│                                                      │
│ 12 pendientes | 3 en proceso | 3 cambios | 41 listas│
│                                                      │
│ Tiempo   Bodega     Cliente       Total      Acción  │
│ 🔴2h18   Santiago   Comercial A   $125.000   [Tomar] │
│ 🟠1h04   Osorno     Empresa B      $62.000   [Tomar] │
│ 🟢18m    Temuco     Cliente C      $84.000   [Tomar] │
└──────────────────────────────────────────────────────┘
```

---

## 138.4 Mesa de trabajo actualizada

```text
┌────────────────────────────────────────────┐
│ FAC-2026-001842                            │
│                                            │
│ DATOS PARA SII                             │
│                                            │
│ Toldo con estructura                       │
│ Cantidad: 2                                │
│                                            │
│ Precio con IVA                             │
│ $28.000                                    │
│                                            │
│ Precio neto para SII                       │
│ $23.529                     [ COPIAR ]      │
│                                            │
│ ───────────────────────────────────────── │
│                                            │
│ TOTAL QUE DEBE DAR EN SII                  │
│                                            │
│              $68.000                       │
│                                            │
│ [ Abrir SII ]                              │
│                                            │
│ Total mostrado por SII                     │
│ $ [________________]                       │
│                                            │
│ ✓ Los valores coinciden                    │
│                                            │
│ FACTURA                                    │
│ Arrastra aquí el PDF                       │
└────────────────────────────────────────────┘
```

---

## 138.5 Factura realizada — solicitante

```text
┌────────────────────────────┐
│ FAC-2026-001801            │
│                            │
│ ✓ Factura lista            │
│                            │
│ Comercial ABC SPA          │
│ $125.000                   │
│                            │
│ [ Ver factura ]            │
│                            │
│ ¿Encontraste un error?     │
│ [ Solicitar cambio ]       │
└────────────────────────────┘
```

---

## 138.6 Rectificación — ejecutor

```text
┌────────────────────────────────────────────┐
│ CORRECCIÓN DE FACTURA                      │
│ FAC-2026-001801                            │
│                                            │
│ Cambio solicitado: Precio incorrecto       │
│                                            │
│ 1. NOTA DE CRÉDITO                         │
│                                            │
│ [ Abrir SII ]                              │
│ Folio [_________]                          │
│ [ Subir PDF ]                              │
│                                            │
│ ✓ Nota de Crédito registrada               │
│                                            │
│ ───────────────────────────────────────── │
│                                            │
│ 2. NUEVA FACTURA                           │
│                                            │
│ Precio con IVA       $28.000               │
│ Neto para SII        $23.529 [Copiar]      │
│                                            │
│ Total esperado       $56.000               │
│                                            │
│ [ Abrir SII ]                              │
│ [ Subir nueva factura ]                    │
│                                            │
│ ───────────────────────────────────────── │
│                                            │
│ 3. FINALIZAR                               │
│                                            │
│ ✓ Factura anterior anulada                 │
│ ✓ Nota de Crédito registrada               │
│ ✓ Nueva factura cargada                    │
│ ✓ Cuadratura validada                      │
│                                            │
│ [ Finalizar corrección ]                   │
└────────────────────────────────────────────┘
```

---

## 138.7 Jefatura — móvil

```text
┌──────────────────────────┐
│ Agosto 2026 ▼            │
│                          │
│ $119.000.000             │
│ Facturado vigente        │
│                          │
│ $19.000.000              │
│ IVA débito estimado      │
│                          │
│ 1.842                    │
│ Facturas                 │
│                          │
│ Pendientes: 12           │
│ En proceso: 3            │
│ Cambios: 3               │
│                          │
│ [ Ver por bodega ]       │
└──────────────────────────┘
```

---

# 139. Decisiones de diseño aprobadas

Se consideran decisiones funcionales de UX:

1. El sistema estará completamente en español.
2. El lenguaje será simple y no técnico.
3. El solicitante podrá operar desde móvil o computador.
4. El ejecutor realizará el proceso de facturación desde computador.
5. La interfaz del ejecutor estará optimizada para trabajo repetitivo de escritorio.
6. Jefatura podrá revisar toda la operación desde computador.
7. Las estadísticas de jefatura estarán optimizadas especialmente para teléfono.
8. El solicitante verá una interfaz simplificada.
9. El ejecutor verá directamente las facturas pendientes.
10. Las solicitudes se ordenarán automáticamente por antigüedad.
11. Existirán botones de copia rápida.
12. Existirá la acción Abrir SII.
13. La carga de PDF será mediante selección o drag & drop.
14. Después de finalizar existirá acceso directo a la siguiente solicitud.
15. El estado `OBSERVADA` se mostrará como `Necesita corrección`.
16. No se usarán filtros globales.
17. Las vistas móviles utilizarán tarjetas.
18. El sistema evitará pasos y confirmaciones innecesarias.
19. Se priorizará prevención de errores.
20. El diseño deberá poder utilizarse sin capacitación extensa.
21. El solicitante sólo trabajará con precios IVA incluido.
22. El ejecutor verá y copiará el precio neto calculado.
23. El total esperado del SII tendrá alta jerarquía visual.
24. La cuadratura será parte explícita del flujo.
25. Una factura realizada no podrá editarse.
26. Una factura realizada podrá iniciar una solicitud de cambio.
27. La rectificación se mostrará como un proceso distinto a una factura inicial.
28. La rectificación tendrá tres etapas: Nota de Crédito, Nueva factura y Finalizar.
29. La factura original permanecerá visible como anulada.
30. La nueva factura se mostrará como documento independiente.
31. El historial de rectificación será entendible para usuarios no técnicos.

---

# 140. Fuera del alcance de este documento

Este documento no define:

- tecnologías;
- framework;
- estructura de base de datos;
- endpoints;
- modelo de autenticación técnico;
- infraestructura;
- seguridad de red;
- estructura de buckets;
- políticas internas de API;
- fórmula técnica definitiva de redondeo;
- tolerancia exacta de cuadratura;
- tratamiento técnico de notas de crédito parciales.

Estas decisiones corresponden a documentos técnicos posteriores.

---

# 141. Entregables visuales posteriores recomendados

Antes de implementación final se recomienda crear:

1. wireframes de alta fidelidad;
2. sistema visual básico;
3. componentes reutilizables;
4. prototipo navegable de los flujos críticos.

Flujos prioritarios para prototipo:

- solicitar factura;
- ingresar productos con IVA incluido;
- detectar duplicado;
- tomar solicitud;
- procesar factura;
- copiar netos para SII;
- validar cuadratura;
- solicitar corrección;
- reenviar corrección;
- finalizar factura;
- solicitar cambio de factura realizada;
- procesar rectificación;
- registrar Nota de Crédito;
- generar nueva factura;
- estadísticas móviles.

---

# 142. Criterio de aprobación

Este documento podrá aprobarse cuando se confirme que:

- los flujos representan correctamente la operación;
- el lenguaje utilizado es adecuado;
- el solicitante puede operar fácilmente desde teléfono;
- el solicitante entiende que todos los precios incluyen IVA;
- el ejecutor tiene un flujo rápido desde computador;
- el ejecutor puede copiar netos sin cálculos manuales;
- la cuadratura con SII es clara;
- jefatura puede consultar estadísticas fácilmente desde móvil;
- no existen pasos innecesarios;
- los estados son comprensibles;
- las acciones críticas están claramente definidas;
- la rectificación de facturas se entiende como un flujo distinto y trazable.

---

# 143. Dictamen

**Estado:** PENDIENTE DE APROBACIÓN

**Responsable de aprobación:** Ángel Ferrer

**Fecha:** __________________

**Observaciones:**  
____________________________________________________________________

**Cambios exigidos:**  
____________________________________________________________________

**Decisiones aceptadas:**  
____________________________________________________________________

**Resultado final:**

- [ ] APROBADO
- [ ] APROBADO CON OBSERVACIONES
- [ ] REQUIERE MODIFICACIONES
- [ ] RECHAZADO

---

# 144. Estado del documento consolidado

**Resultado:** DOCUMENTO DE DISEÑO FUNCIONAL Y UX v1.1 CONSOLIDADO

Este documento integra en una única fuente:

- el Diseño Funcional y UX v1.0;
- las reglas de precio IVA incluido;
- la experiencia simplificada del solicitante;
- la visualización de precio neto para el ejecutor;
- los botones de copia específicos;
- la validación de cuadratura con SII;
- la restricción de finalización con diferencias;
- la inmutabilidad de facturas realizadas;
- el flujo `Solicitar cambio`;
- el proceso visual de rectificación;
- el registro de Nota de Crédito;
- la nueva factura corregida;
- el historial visible de rectificación;
- las estadísticas de facturación vigente;
- las reglas UX-021 a UX-034;
- los wireframes actualizados.

A partir de su aprobación, este documento deberá utilizarse como **fuente única de Diseño Funcional y UX del Sistema de Gestión de Facturas Maxiofertas**.
