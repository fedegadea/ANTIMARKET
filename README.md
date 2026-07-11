# Anti Market

Comercio curado de marcas independientes argentinas. **Las 30 marcas.**

Dos interfaces sobre un mismo motor:
- **El Shopping** — vidriera digital con local virtual por marca, espejado en tiempo real desde Tienda Nube. La compra se cierra en el checkout de cada marca (Fase A).
- **El Agente** — personal shopper conversacional (Claude API) con memoria de clienta, sobre el catálogo unificado con stock real.

Modelo de negocio: **7% de comisión** sobre ventas atribuidas (ventana de 7 días, atribución técnica con evidencia). La comisión se acumula como crédito a favor de Anti Market; liquidación mensual (quincenal si supera umbral), pago a 10 días.

## Stack

HTML/CSS/JS vanilla (`public/`) + funciones serverless de Vercel (`api/`, Web Handlers) + Supabase (DB + auth OTP) + Claude API. Única dependencia: `@supabase/supabase-js`.

La spec completa vive en [docs/SPEC.md](docs/SPEC.md). **Es la fuente de verdad.**

## Puesta en marcha

### 1. Supabase
1. Crear proyecto en [supabase.com](https://supabase.com).
2. SQL Editor → pegar y correr `db/schema.sql` (idempotente, se puede re-correr).
3. Authentication → habilitar Email (magic link / OTP). Configurar SMTP propio si se quiere buen deliverability.
4. Copiar `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

### 2. App de Tienda Nube
1. Crear la app en el [portal de partners](https://partners.tiendanube.com).
2. Scopes: `read_products`, `read_orders`, `write_webhooks`, `write_coupons`, `write_draft_orders` (verificar nombres exactos en el portal).
3. URL de redirección: `https://<dominio>/api/tn/callback`.
4. Copiar `TN_APP_ID` y `TN_CLIENT_SECRET`.

### 3. Variables de entorno (Vercel → Settings → Environment Variables)
```
SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
TN_APP_ID / TN_CLIENT_SECRET / TN_REDIRECT_URI
ANTHROPIC_API_KEY / ANTHROPIC_MODEL        # ej: claude-sonnet-5
TOKEN_ENCRYPTION_KEY                        # openssl rand -hex 32
ADMIN_EMAILS                                # coma-separado
EMAIL_PROVIDER_API_KEY                      # Resend
EMAIL_FROM                                  # ej: Anti Market <hola@antimarket.com.ar>
PAYMENT_ALIAS                               # alias/CBU para cobrar liquidaciones
PUBLIC_BASE_URL                             # https://<dominio>
CRON_SECRET                                 # openssl rand -hex 16 (Vercel lo manda solo a los crons)
```

### 4. Deploy
```bash
npm install
vercel --prod
```
Los crons quedan definidos en `vercel.json`: reconcile diario 05:00 ART, settle los días 1 y 16 a las 06:00 ART.

### 5. Conectar la primera marca
Mandarle a la marca el link `https://<dominio>/api/tn/install` → autoriza la app → queda `pending` → aprobarla en `/admin` (recién ahí aparece en el shopping).

## Criterios de aceptación por etapa (spec §15)
1. **Motor**: cambiar un precio en TN y verlo en la DB sin intervención; una orden de prueba aparece en `orders`.
2. **Atribución**: flujo view → add_to_cart → checkout_redirect → orden de prueba ⇒ atribución `shopping` al 7% con evidencia; con touch de agente ⇒ canal `agent`.
3. **Shopping**: una compradora real descubre, arma carrito, paga en la tienda de la marca y la orden queda atribuida. Lighthouse mobile ≥ 85.
4. **Agente**: conversación de punta a punta que termina en recomendaciones con stock real y orden atribuida al canal `agent`.
5. **Paneles**: liquidación de prueba generada por cron, visible en el panel de la marca, marcada pagada desde admin.
