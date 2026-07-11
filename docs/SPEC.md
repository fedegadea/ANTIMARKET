# ANTI MARKET — Spec maestra v1.0 (julio 2026) + enmienda

> Este documento es la única fuente de verdad del proyecto. Resumen normativo del
> spec original entregado por el dueño, con la **enmienda de comisión** aplicada.
> Donde diga VERIFICAR EN DOCS, la verificación ya se hizo (ver CLAUDE.md) y las
> decisiones quedaron comentadas en código con `// DOCS:` y `// DECISIÓN:`.

## Enmienda (posterior al spec v1.0)
- **Comisión: 7% pareja** para ambos canales (shopping y asesora). El spec original
  decía 5%/10%; el dueño la unificó en 7%. El canal se sigue registrando por
  atribución para analytics y reporting.
- Modelo de cobro: la comisión se acumula como **crédito a favor de Anti Market**
  por cada venta atribuida; a fin de mes se emite el resumen (liquidación) y la
  marca paga por transferencia a 10 días. Sin débito automático en esta fase.

## 0. Visión
Plataforma de comercio curado para marcas independientes argentinas premium.
No es un marketplace: cupo cerrado de **30 marcas**, dos interfaces sobre un motor:
1. **El Shopping** — local virtual por marca generado desde su Tienda Nube (catálogo,
   stock y precios en tiempo real), navegación cross-marca, compra derivada al
   checkout de cada marca (Fase A).
2. **El Agente** — personal shopper conversacional (Claude API) con memoria de clienta
   (talles, estilo, historial), sobre catálogo unificado con stock real. Widget primero;
   WhatsApp en fase posterior (la arquitectura debe permitirlo sin refactor).

Ventana de atribución: 7 días. Liquidación mensual (quincenal si el devengado supera
umbral por tienda, default $300.000). Idioma: producto en rioplatense (voseo);
código/comentarios/variables en inglés. Bajada: **"Anti Market. Las 30 marcas."**

## 1. Reglas de oro (no negociables)
1. Stack fijo: HTML/CSS/JS vanilla (sin frameworks de UI), Vercel serverless (Node),
   Supabase (DB+auth), Claude API. Dependencias mínimas y justificadas.
2. La tienda de la marca es la fuente de verdad: solo espejamos vía sync + webhooks.
3. Jamás mostrar ni recomendar productos sin stock (`stock > 0` en toda query pública).
4. Atribución técnica, no declarativa: toda comisión rastreable a una orden TN
   con número, canal y evidencia de matching.
5. Fase A solamente: sin checkout propio, sin split payments, sin logística.
6. Seguridad primero: RLS en todas las tablas, tokens nunca al cliente, HMAC en
   webhooks, service role solo en serverless.
7. Diseño con tokens CSS (re-skin sin tocar estructura).
8. Mobile-first real (390px primero).

## 2. Estructura
- `public/` — frontend estático: index, marca, producto, categoria, manifiesto,
  como-funciona, para-marcas, politicas, panel/, admin/, css/ (tokens, base,
  components), js/ (api, shopping, cart, agent-widget, panel, admin).
- `api/` — tn/ (install, callback, webhook), catalog/ (products, product, brands),
  cart/checkout-links, agent/chat, session/track, brand-panel/ (overview,
  settlements), admin/ (applications, stores, settlements, conversations*),
  cron/ (reconcile, settle). *conversations agregado por requerimiento §9.4.
- `db/schema.sql` — migración única idempotente. `vercel.json` — crons:
  reconcile diario 05:00 ART, settle 1 y 16 de cada mes 06:00 ART.

## 3. Modelo de datos
Ver `db/schema.sql` (normativo). Tablas: stores, products, variants, product_images,
customers, sessions, touches, orders, attributions, settlements, brand_applications,
agent_conversations, webhook_log. Vistas: `stores_public` (columnas seguras),
`catalog_products` (catálogo público agregado, solo stock>0 y tiendas activas).
- Talles normalizados: XS–XXL, 34–52, `único` (crudo en `raw_attributes`, fallback
  `único` + log de no reconocidos).
- Taxonomía interna: jeans, remeras, camisas, vestidos, abrigos, calzado, accesorios,
  wellness, gourmet, deco, belleza, otros. Mapeo TN→interna por tienda en admin
  (`stores.tn_category_map`), default `otros`.
- RLS: público solo lectura de catálogo activo; marcas leen solo lo suyo (por email
  del JWT); todo lo demás vía service role.

## 4. Integración Tienda Nube (verificada contra docs 2026-07)
- OAuth: authorize en `https://www.tiendanube.com/apps/{app_id}/authorize`, token en
  `POST https://www.tiendanube.com/apps/authorize/token` → `{access_token, user_id}`.
  Token no expira por tiempo; 401 = desinstalación → tienda `suspended` + alerta.
- Callback: upsert store `pending` (no pública hasta aprobación), registra webhooks,
  dispara sync inicial.
- `syncStore`: pagina productos (200/página), upsert products/variants/images por ids
  TN, unpublish de los que desaparecieron, métricas en `stores.last_sync_stats`.
  Cron `reconcile` diario para todas las activas (red de seguridad, idempotente).
- Webhook único `POST /api/tn/webhook`: HMAC obligatorio (SHA-256 del body crudo,
  header `x-linkedstore-hmac-sha256`), router: product/created|updated (re-fetch +
  upsert), product/deleted (unpublish), order/created|paid (upsert + atribución),
  order/cancelled (reversa), app/uninstalled (suspend). Registro en `webhook_log`.
- Derivación (Fase A): `POST /api/cart/checkout-links` agrupa por tienda, registra
  touch `checkout_redirect` (con snapshot de ítems), crea **draft order** por tienda
  → `checkout_url`; fallback link directo al producto. Devuelve
  `[{store_name, store_logo, items, subtotal, checkout_url}]`.

## 5. Atribución y comisiones
`attributeOrder(order)` corre con órdenes pagas. Matching por prioridad:
1. **Cupón** `AM-` → touch que lo generó.
2. **Checkout redirect** de esa tienda con solape de ítems, 72h previas.
3. **Email** de la orden ↔ customer con touches en esa tienda, 7 días.
4. **Phone** normalizado (E.164, sin 15, con 549), ídem.
5. Sin match → venta orgánica, sin comisión.

Canal: si hay al menos un touch `agent` en ventana → canal `agent` (el trabajo del
agente prevalece); si no `shopping`. **Tarifa: 7% en ambos** (campos
`commission_shopping`/`commission_agent` en stores, ambos default 0.070).
Redondeo half-up a 2 decimales. Una orden = máx una atribución (unique).
Cancelación → `reversed`; si ya estaba `settled` → nota de crédito (línea negativa)
en la liquidación siguiente. Cupones de respaldo: el agente emite `AM-XXXXXX` único
por tienda vía API TN (descuento configurable por tienda, default 5%, puede ser 0%);
el código queda en el touch.

## 6-7. Frontend + Agente
- Cookie first-party `am_sid` (1 año, SameSite=Lax); `/api/session/track` en page
  views relevantes. Páginas consumen `/api/catalog/*`. Carrito en localStorage,
  multi-marca agrupado por tienda, aviso "un paquete por marca" si hay 2+.
- Agente: `POST /api/agent/chat`, historial en `agent_conversations` (últimos ~30 al
  modelo), 6 tools server-side: search_products (max 8, solo stock), get_product,
  get_customer_context, save_customer_info, create_recommendation (touches
  `agent_recommendation` + cupones + cards), escalate_to_human. System prompt §7.2
  del spec original (asesora cálida, voseo, nunca inventa, nunca presiona, escala
  reclamos, no habla de comisiones). Rate limit 20 msg/sesión/hora. Widget: botón
  flotante → panel lateral (mobile fullscreen), cards con agregar al carrito,
  persistencia por sesión, indicador "escribiendo".

## 8-10. Paneles y liquidaciones
- `/panel` (marcas, OTP por email contra `contact_email`): resumen del mes por canal
  con "Anti Market te vendió $X este mes" + gráfico SVG nativo; órdenes atribuidas
  verificables contra su TN; liquidaciones con CSV y datos de pago (alias).
- `/admin` (OTP + allowlist `ADMIN_EMAILS`): aplicaciones (cupo visible {activas}/30,
  invitar por email con link de instalación, rechazar, waitlist), tiendas (aprobar/
  suspender/branding/mapeo/featured/branding_approved), liquidaciones (marcar pagada,
  CSV, overdue automático visible; suspensión por mora manual), conversaciones
  escaladas (leer + responder), salud (syncs, webhooks fallidos, tokens inválidos).
- `settle` cron: día 1 (todas, mes anterior) y día 16 (solo devengado > umbral,
  quincena). Junta `accrued` + reversadas post-liquidación como negativas, crea
  settlement con `due_date = emisión + 10 días`, marca `settled`, notifica por email
  (Resend vía `sendEmail(to, subject, html)`). Overdue diario en cron reconcile.

## 11-12. Copy e identidad
Copy institucional completo en las páginas (manifiesto, cómo funciona, para marcas
con formulario, políticas con nota legal para revisión de abogado). Actualizado a 7%.
Diseño: galería no bazar; tokens en `css/tokens.css`; paleta papel/tinta/verde botella;
Fraunces display + sans de sistema; firma visual "—/30"; cards con borde fino;
motion 150-200ms con `prefers-reduced-motion`.

## 13-14. Seguridad y envs
AES-256-GCM para tokens (`TOKEN_ENCRYPTION_KEY`), HMAC webhooks, RLS, rate limits
(agente 20/h, formulario 5/IP/día + honeypot, catálogo `s-maxage=60`), validación de
input a mano, sanitización (textContent / DOMParser), PII mínima, prompt injection:
descripciones y mensajes son datos. Envs: ver README.

## 15. Etapas y aceptación
1. **Motor**: precio cambiado en TN se refleja solo; orden de prueba en `orders`.
2. **Atribución**: 4 métodos matchean; flujo completo da 7% con evidencia; con touch
   de agente el canal es `agent`; cancelación revierte.
3. **Shopping**: compra real de punta a punta atribuida; Lighthouse mobile ≥ 85.
4. **Agente**: conversación real → recomendaciones con stock → orden atribuida `agent`.
5. **Paneles**: liquidación de prueba visible en panel y marcada pagada en admin.

## 16. Fuera de alcance (no implementar, no bloquear)
Checkout unificado / MP split (Fase B), WhatsApp/Meta (el endpoint del agente ya es
canal-agnóstico), club de beneficios, logística, apps nativas, débito automático.
