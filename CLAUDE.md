# Anti Market — guía para Claude Code

**Fuente de verdad: [docs/SPEC.md](docs/SPEC.md).** No agregar features fuera de la spec. Ambigüedades: opción más simple que cumpla el criterio de aceptación + comentario `// DECISIÓN:`.

## Reglas de oro (resumen)
1. Stack fijo: HTML/CSS/JS vanilla + Vercel serverless (Web Handlers ESM) + Supabase + Claude API. Sin frameworks de UI. Única dep: `@supabase/supabase-js`.
2. Tienda Nube es la fuente de verdad del catálogo: solo espejamos (sync + webhooks).
3. Jamás mostrar/recomendar sin stock: `stock > 0` en toda query pública.
4. Atribución técnica, auditable, una por orden. **Comisión: 7% pareja en ambos canales** (enmienda del dueño sobre spec v1.0 que decía 5/10) — el canal se sigue registrando.
5. Fase A: el pago se cierra en el checkout de cada marca (draft orders de TN → `checkout_url`). Sin checkout propio.
6. Seguridad: RLS activo, tokens TN cifrados AES-256-GCM y nunca al cliente, HMAC en webhooks, service role solo en serverless, textContent (nunca innerHTML con datos externos).
7. Todo lo visual en tokens (`public/css/tokens.css`).
8. Mobile-first a 390px. Producto en voseo rioplatense; código y comentarios en inglés.

## Verificación TN (hecha 2026-07)
- API base `https://api.tiendanube.com/2025-03/{store_id}`, `Authorization: Bearer`, `User-Agent` obligatorio, paginación `page`/`per_page` (max 200), rate limit leaky bucket 40/2rps.
- Webhooks: HMAC SHA-256 del body crudo, header `x-linkedstore-hmac-sha256`; payload `{store_id, event, id}`.
- Derivación: no hay cart-permalink documentado; se usan **draft orders** (`POST /draft_orders` → `checkout_url`) con fallback a link directo del producto.

## Comandos
- Deploy: `vercel --prod`
- Migración: correr `db/schema.sql` en el SQL editor de Supabase (idempotente).
- Syntax check rápido: `for f in lib/*.js api/*/*.js api/*.js; do node --check "$f"; done`
