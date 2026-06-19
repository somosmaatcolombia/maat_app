# MAAT - Suspension de acceso por pago (admin)

> El administrador puede revisar a los clientes, ver quien tiene el pago vencido y
> suspender / reactivar su acceso a la app. Suspension manual (no automatica).

## Que se construyo

| Pieza | Archivo | Que hace |
|-------|---------|----------|
| Schema | `sql/maat_suspension_pagos.sql` | profiles += paid_through, suspended_at, suspended_reason, suspended_by + trigger de seguridad |
| Portal admin | `src/maat_mentor_dashboard.html` | Vista "Usuarios" (admin-only) con estado de pago, filtros, y acciones Suspender / Reactivar / Registrar pago |

## Como funciona

- **`profiles.active`** sigue siendo la compuerta: la app del cliente ya bloquea el
  login si `active=false` (muestra "Tu cuenta esta desactivada, contacta a tu mentor").
- **Suspender** = `active=false` + sella `suspended_at`, `suspended_reason` (default
  "Pago pendiente"), `suspended_by`.
- **Registrar pago** = avanza `paid_through` +1 mes y reactiva el acceso.
- **Vencido** = `paid_through < hoy`. La vista lo resalta (chip rojo "Vencido Nd") y
  hay un filtro rapido de Vencidos / Suspendidos con contador.

## Seguridad (importante)

La policy RLS `profiles_update` permite a un cliente editar su PROPIA fila, asi que sin
proteccion podria poner `active=true` y saltarse la suspension. El SQL agrega un
**trigger** (`protect_profile_billing_columns`) que impide a cualquier NO-staff
(cliente) cambiar `active` / `paid_through` / `suspended_*`. Solo mentor o admin pueden.

> Nota: el bloqueo se aplica al abrir/recargar la app. Un cliente con sesion ya abierta
> mantiene acceso hasta que recargue. (Expulsion en caliente via realtime = mejora futura
> opcional.)

## Activacion (pasos del usuario)

1. **SQL:** correr `sql/maat_suspension_pagos.sql` en Supabase (proyecto
   `pcclptmojjzqmfmzftot`). Idempotente. La verificacion final debe listar las 4
   columnas y el trigger `trg_protect_profile_billing`.
2. **Re-desplegar el portal:** `./build_deploy.sh` y subir `deploy/mentor/index.html`.

## QA

1. Login como **admin** > pestana **Usuarios**.
2. Filtro **Vencidos**: aparecen los clientes con `paid_through` pasado y aun activos.
3. **Suspender** uno (motivo "Pago pendiente") > su estado pasa a "Suspendido".
4. Abrir la app del cliente suspendido: debe bloquear el login con el mensaje de cuenta
   desactivada.
5. **Registrar pago** del mismo: queda al dia (+1 mes) y se reactiva; el cliente vuelve
   a entrar.
6. (Seguridad) Un cliente NO puede reactivarse solo: un UPDATE a su propia fila tocando
   `active` debe fallar con el error del trigger.
