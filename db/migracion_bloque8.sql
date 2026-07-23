-- Anti Market — Bloque 8: comisión de Anti Market en 6,5%.
-- Pegar en Supabase → SQL Editor → Run. Idempotente.
-- Afecta atribuciones NUEVAS (las viejas conservan su commission_rate guardado).

-- nuevo default para tiendas futuras
alter table stores alter column commission_shopping set default 0.065;
alter table stores alter column commission_agent set default 0.065;

-- pasar a 6,5% las tiendas que están en el default anterior (respeta tarifas custom distintas)
update stores set commission_shopping = 0.065 where commission_shopping in (0.070, 0.050);
update stores set commission_agent   = 0.065 where commission_agent   in (0.070, 0.050);
