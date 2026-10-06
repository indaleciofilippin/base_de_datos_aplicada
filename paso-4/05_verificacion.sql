-- 05 · Verificación: filas por tabla, los mismos totales por tres caminos (archivo, archivo limpio
-- y DW), hechos sin dimensión y una fila de hechos bajada hasta el archivo.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
USE entregas_dw;

-- Filas por tabla
SELECT 'stg_entregas' AS tabla, COUNT(*) AS filas FROM stg_entregas
UNION ALL SELECT 'stg_limpia', COUNT(*) FROM stg_limpia
UNION ALL SELECT 'stg_limpia descartadas', COUNT(*) FROM stg_limpia WHERE motivo_descarte IS NOT NULL
UNION ALL SELECT 'dim_tiempo', COUNT(*) FROM dim_tiempo
UNION ALL SELECT 'dim_transportista', COUNT(*) FROM dim_transportista
UNION ALL SELECT 'dim_metodo_envio', COUNT(*) FROM dim_metodo_envio
UNION ALL SELECT 'dim_prioridad', COUNT(*) FROM dim_prioridad
UNION ALL SELECT 'dim_clima', COUNT(*) FROM dim_clima
UNION ALL SELECT 'dim_deposito', COUNT(*) FROM dim_deposito
UNION ALL SELECT 'dim_destino', COUNT(*) FROM dim_destino
UNION ALL SELECT 'fact_entregas', COUNT(*) FROM fact_entregas;

-- Conciliación: archivo = archivo limpio = DW
SELECT 'archivo (stg_entregas)' AS origen,
       COUNT(*) AS envios,
       SUM(late_delivery = 'Yes') AS envios_tardios,
       SUM(CAST(delivery_delay_days AS SIGNED)) AS dias_de_demora,
       SUM(CAST(shipping_cost_usd AS DECIMAL(10,2))) AS costo_flete_total,
       SUM(CASE WHEN late_delivery = 'Yes' THEN CAST(shipping_cost_usd AS DECIMAL(10,2)) ELSE 0 END)
         AS costo_flete_incumplido,
       SUM(CAST(distance_km AS DECIMAL(10,2))) AS distancia_total_km
FROM stg_entregas
UNION ALL
SELECT 'archivo limpio (stg_limpia)',
       COUNT(*),
       SUM(late_delivery = 'Yes'),
       SUM(delivery_delay_days),
       SUM(shipping_cost_usd),
       SUM(CASE WHEN late_delivery = 'Yes' THEN shipping_cost_usd ELSE 0 END),
       SUM(distance_km)
FROM stg_limpia
WHERE motivo_descarte IS NULL
UNION ALL
SELECT 'DW (fact_entregas)',
       SUM(cantidad_envios),
       ROUND(SUM(tasa_demora * cantidad_envios)),
       ROUND(SUM(dias_demora_promedio * cantidad_envios)),
       SUM(costo_flete_total),
       SUM(costo_flete_incumplido),
       SUM(distancia_total_km)
FROM fact_entregas;

-- Hechos sin dimensión
SELECT COUNT(*) AS hechos_sin_dimension
FROM fact_entregas f
LEFT JOIN dim_tiempo t         ON t.id_tiempo = f.id_tiempo
LEFT JOIN dim_transportista tr ON tr.id_transportista = f.id_transportista
LEFT JOIN dim_metodo_envio m   ON m.id_metodo_envio = f.id_metodo_envio
LEFT JOIN dim_prioridad p      ON p.id_prioridad = f.id_prioridad
LEFT JOIN dim_clima c          ON c.id_clima = f.id_clima
LEFT JOIN dim_deposito d       ON d.id_deposito = f.id_deposito
LEFT JOIN dim_destino de       ON de.id_destino = f.id_destino
WHERE t.id_tiempo IS NULL OR tr.id_transportista IS NULL OR m.id_metodo_envio IS NULL
   OR p.id_prioridad IS NULL OR c.id_clima IS NULL OR d.id_deposito IS NULL OR de.id_destino IS NULL;

-- Trazabilidad: la fila de hechos con más envíos, bajada hasta el archivo
SELECT id_tiempo, id_transportista, id_metodo_envio, id_prioridad, id_clima, id_deposito, id_destino
INTO @t, @tr, @m, @p, @c, @d, @de
FROM fact_entregas
ORDER BY cantidad_envios DESC, id_tiempo
LIMIT 1;

-- 1) la fila de hechos
SELECT id_tiempo, id_transportista, id_metodo_envio, id_prioridad, id_clima, id_deposito, id_destino,
       cantidad_envios, tasa_demora, costo_flete_total, distancia_total_km, rating_promedio
FROM fact_entregas
WHERE id_tiempo = @t AND id_transportista = @tr AND id_metodo_envio = @m AND id_prioridad = @p
  AND id_clima = @c AND id_deposito = @d AND id_destino = @de;

-- 2) cada clave nueva abierta en su clave natural
SELECT t.fecha, tr.nombre_transportista, m.nombre_metodo, p.nombre_prioridad,
       c.condicion_climatica, d.codigo_deposito, de.ciudad_destino
FROM fact_entregas f
JOIN dim_tiempo t         ON t.id_tiempo = f.id_tiempo
JOIN dim_transportista tr ON tr.id_transportista = f.id_transportista
JOIN dim_metodo_envio m   ON m.id_metodo_envio = f.id_metodo_envio
JOIN dim_prioridad p      ON p.id_prioridad = f.id_prioridad
JOIN dim_clima c          ON c.id_clima = f.id_clima
JOIN dim_deposito d       ON d.id_deposito = f.id_deposito
JOIN dim_destino de       ON de.id_destino = f.id_destino
WHERE f.id_tiempo = @t AND f.id_transportista = @tr AND f.id_metodo_envio = @m AND f.id_prioridad = @p
  AND f.id_clima = @c AND f.id_deposito = @d AND f.id_destino = @de;

-- 3) los envíos de stg_limpia con esas claves naturales, tal como vinieron en stg_entregas
SELECT e.order_id, e.order_date, e.carrier, e.shipping_method, e.order_priority, e.weather_condition,
       e.warehouse_id, e.customer_city, e.late_delivery, e.shipping_cost_usd, e.distance_km,
       e.customer_rating
FROM stg_limpia s
JOIN stg_entregas e       ON e.order_id = s.order_id
JOIN dim_tiempo t         ON t.fecha = s.fecha
JOIN dim_transportista tr ON tr.nombre_transportista = s.carrier
JOIN dim_metodo_envio m   ON m.nombre_metodo = s.shipping_method
JOIN dim_prioridad p      ON p.nombre_prioridad = s.order_priority
JOIN dim_clima c          ON c.condicion_climatica = s.weather_condition
JOIN dim_deposito d       ON d.codigo_deposito = s.warehouse_id
JOIN dim_destino de       ON de.ciudad_destino = s.customer_city
WHERE s.motivo_descarte IS NULL
  AND t.id_tiempo = @t AND tr.id_transportista = @tr AND m.id_metodo_envio = @m AND p.id_prioridad = @p
  AND c.id_clima = @c AND d.id_deposito = @d AND de.id_destino = @de;
