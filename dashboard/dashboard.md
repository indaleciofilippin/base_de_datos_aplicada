# Dashboard · Logística y entrega de pedidos de e-commerce

Cada pregunta del Paso 1 se responde con una consulta sobre el modelo estrella de `entregas_dw`: `fact_entregas` y sus dimensiones. Como los promedios y las tasas están guardados por fila, al agrupar se recalculan como `SUM(hecho * cantidad_envios) / SUM(cantidad_envios)`, nunca como promedio de promedios. Los gráficos los genera `dashboard.py` con matplotlib, corriendo estas mismas consultas.

## Pregunta 1

¿Cuántos envíos despachó cada transportista, con qué tasa de demora y cuántos días de demora promedio, dentro de cada método de envío y por trimestre? (para decidir a quién se le renueva el contrato y a quién se le saca volumen)

### SQL

```sql
SELECT tr.nombre_transportista AS transportista,
       m.nombre_metodo AS metodo_envio,
       t.trimestre,
       SUM(f.cantidad_envios) AS envios,
       ROUND(100 * SUM(f.tasa_demora * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_demora_pct,
       ROUND(SUM(f.dias_demora_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS dias_demora_promedio
FROM fact_entregas f
JOIN dim_transportista tr ON tr.id_transportista = f.id_transportista
JOIN dim_metodo_envio m   ON m.id_metodo_envio = f.id_metodo_envio
JOIN dim_tiempo t         ON t.id_tiempo = f.id_tiempo
GROUP BY tr.nombre_transportista, m.nombre_metodo, t.trimestre
ORDER BY m.nombre_metodo, t.trimestre, tasa_demora_pct;
```

### Resultado

Primeras 8 de las 160 filas: Economy en el trimestre 1, de menor a mayor tasa de demora.

| transportista | metodo_envio | trimestre | envios | tasa_demora_pct | dias_demora_promedio |
|---|---|---|---|---|---|
| ParcelPro | Economy | 1 | 153 | 50.3 | 1.21 |
| SwiftShip | Economy | 1 | 160 | 52.5 | 1.17 |
| SpeedyCargo | Economy | 1 | 176 | 53.4 | 1.16 |
| EagleCourier | Economy | 1 | 178 | 57.3 | 1.39 |
| PrimeDelivery | Economy | 1 | 167 | 65.3 | 1.66 |
| BlueRoute | Economy | 1 | 175 | 69.1 | 1.85 |
| FastTrack Logistics | Economy | 1 | 150 | 69.3 | 1.63 |
| GlobalExpress | Economy | 1 | 174 | 69.5 | 1.70 |

### Gráfico

![Pregunta 1](graficos/p1.png)

Son diez mapas de calor, dos por método de envío: en el de la izquierda cada celda muestra la tasa de demora y el total de envíos, y en el de la derecha, los días de demora promedio. Las filas son los transportistas, ordenados de menor a mayor tasa de demora en el año, y las columnas son los trimestres. Cuanto más oscura la celda, más demora.

### Lectura

SwiftShip tiene la tasa de demora más baja en 13 de las 20 combinaciones de método y trimestre y GlobalExpress la más alta en 12, y en International los días de demora acompañan (de 1,49 a 1,71 contra 2,49 a 2,70). En Same Day hay entre 42 y 75 envíos por combinación y el orden cambia cada trimestre, así que ahí los datos no alcanzan para decidir.

## Pregunta 2

¿Cuántos días de entrega se prometen y cuántos se tardan realmente en cada método de envío, mes a mes? (para saber si el problema es de ejecución o de una promesa mal calibrada en el sitio)

### SQL

```sql
SELECT m.nombre_metodo AS metodo_envio,
       t.mes,
       SUM(f.cantidad_envios) AS envios,
       ROUND(SUM(f.dias_prometidos_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS dias_prometidos_promedio,
       ROUND(SUM(f.dias_reales_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS dias_reales_promedio,
       ROUND(100 * SUM(f.tasa_demora * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_demora_pct
FROM fact_entregas f
JOIN dim_metodo_envio m ON m.id_metodo_envio = f.id_metodo_envio
JOIN dim_tiempo t       ON t.id_tiempo = f.id_tiempo
GROUP BY m.nombre_metodo, t.mes
ORDER BY m.nombre_metodo, t.mes;
```

### Resultado

Primeras 12 de las 60 filas: Economy, de enero a diciembre.

| metodo_envio | mes | envios | dias_prometidos_promedio | dias_reales_promedio | tasa_demora_pct |
|---|---|---|---|---|---|
| Economy | 1 | 457 | 9.24 | 10.41 | 58.0 |
| Economy | 2 | 424 | 9.24 | 10.61 | 66.5 |
| Economy | 3 | 452 | 9.28 | 10.57 | 58.6 |
| Economy | 4 | 430 | 9.25 | 10.53 | 65.1 |
| Economy | 5 | 513 | 9.27 | 10.52 | 61.6 |
| Economy | 6 | 474 | 9.28 | 10.69 | 62.4 |
| Economy | 7 | 485 | 9.22 | 10.47 | 60.6 |
| Economy | 8 | 457 | 9.30 | 10.62 | 61.3 |
| Economy | 9 | 454 | 9.22 | 10.50 | 62.6 |
| Economy | 10 | 467 | 9.31 | 10.59 | 62.1 |
| Economy | 11 | 465 | 9.32 | 10.68 | 62.8 |
| Economy | 12 | 499 | 9.27 | 10.51 | 59.5 |

### Gráfico

![Pregunta 2](graficos/p2.png)

Cada color es un método de envío: la línea continua con puntos es el promedio de días reales de entrega y la discontinua, el promedio de días prometidos, mes a mes. La distancia entre las dos líneas de un mismo color muestra cuántos días de más tarda la entrega.

### Lectura

En los cinco métodos y los doce meses se tarda más de lo prometido, con una diferencia casi fija para cada método (de 0,21 a 0,36 días en Same Day hasta 1,75 a 1,99 en International), así que el problema no es de ejecución en un mes puntual sino una promesa calibrada de menos.

## Pregunta 3

¿Qué tasa de demora y cuántos días de demora promedio produce cada combinación de clima y prioridad de la orden, y cuántos envíos quedan expuestos, por trimestre? (para armar el protocolo de contingencia cuando el pronóstico es malo)

### SQL

```sql
SELECT c.condicion_climatica AS clima,
       p.nombre_prioridad AS prioridad,
       t.trimestre,
       SUM(f.cantidad_envios) AS envios,
       ROUND(100 * SUM(f.tasa_demora * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_demora_pct,
       ROUND(SUM(f.dias_demora_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS dias_demora_promedio
FROM fact_entregas f
JOIN dim_clima c     ON c.id_clima = f.id_clima
JOIN dim_prioridad p ON p.id_prioridad = f.id_prioridad
JOIN dim_tiempo t    ON t.id_tiempo = f.id_tiempo
GROUP BY c.condicion_climatica, p.nombre_prioridad, t.trimestre
ORDER BY t.trimestre, tasa_demora_pct DESC, clima, prioridad;
```

### Resultado

Primeras 10 de las 96 filas: trimestre 1, de mayor a menor tasa de demora.

| clima | prioridad | trimestre | envios | tasa_demora_pct | dias_demora_promedio |
|---|---|---|---|---|---|
| Storm | Low | 1 | 198 | 99.5 | 3.93 |
| Snow | Low | 1 | 186 | 98.9 | 4.38 |
| Snow | Normal | 1 | 568 | 96.8 | 3.45 |
| Storm | Normal | 1 | 558 | 95.3 | 3.14 |
| Snow | High | 1 | 362 | 93.4 | 2.60 |
| Rain | Low | 1 | 334 | 92.2 | 2.40 |
| Storm | High | 1 | 393 | 89.1 | 2.29 |
| Extreme Heat | Low | 1 | 128 | 82.0 | 1.87 |
| Cloudy | Low | 1 | 452 | 77.2 | 1.55 |
| Rain | Normal | 1 | 1020 | 77.2 | 1.63 |

### Gráfico

![Pregunta 3](graficos/p3.png)

Dos hileras de mapas de calor con un cuadro por trimestre, de T1 a T4; en cada cuadro el clima va en las filas y la prioridad de la orden en las columnas. En la hilera de arriba, cada celda muestra el porcentaje de envíos que llegaron tarde y el total de envíos de esa combinación; en la de abajo, los días de demora promedio. Cuanto más oscura la celda, más demora.

### Lectura

Con cielo despejado la prioridad hace la diferencia (se demora entre el 64,8 y el 69,5 % de los Low y entre el 4,5 y el 6,4 % de los Urgent), pero con nieve o tormenta llega tarde entre el 84,5 y el 99,5 % de los Low, Normal y High y aun entre el 64,6 y el 77,5 % de los Urgent. Cada trimestre quedan expuestos a nieve o tormenta entre 2.410 y 2.529 envíos, y el cuadro se repite casi igual los cuatro trimestres.

## Pregunta 4

¿Cuántos envíos, cuánto costo de flete y cuántos kilómetros genera cada depósito de origen, mes a mes? (para dimensionar la dotación y la capacidad de cada nodo de la red)

### SQL

```sql
SELECT d.codigo_deposito,
       d.ciudad_deposito,
       t.mes,
       SUM(f.cantidad_envios) AS envios,
       SUM(f.costo_flete_total) AS costo_flete_total,
       SUM(f.distancia_total_km) AS distancia_total_km
FROM fact_entregas f
JOIN dim_deposito d ON d.id_deposito = f.id_deposito
JOIN dim_tiempo t   ON t.id_tiempo = f.id_tiempo
GROUP BY d.codigo_deposito, d.ciudad_deposito, t.mes
ORDER BY d.codigo_deposito, t.mes;
```

### Resultado

Primeras 12 de las 120 filas: WH-001 New York, de enero a diciembre.

| codigo_deposito | ciudad_deposito | mes | envios | costo_flete_total | distancia_total_km |
|---|---|---|---|---|---|
| WH-001 | New York | 1 | 628 | 72105.06 | 1508676.10 |
| WH-001 | New York | 2 | 582 | 70141.04 | 1413170.00 |
| WH-001 | New York | 3 | 646 | 76473.45 | 1585432.50 |
| WH-001 | New York | 4 | 629 | 74535.46 | 1517163.50 |
| WH-001 | New York | 5 | 659 | 77266.71 | 1594987.20 |
| WH-001 | New York | 6 | 630 | 72756.06 | 1526750.00 |
| WH-001 | New York | 7 | 666 | 77144.27 | 1624495.50 |
| WH-001 | New York | 8 | 694 | 84494.96 | 1781320.20 |
| WH-001 | New York | 9 | 595 | 69175.83 | 1424138.60 |
| WH-001 | New York | 10 | 574 | 67895.24 | 1392007.20 |
| WH-001 | New York | 11 | 650 | 76996.06 | 1573013.80 |
| WH-001 | New York | 12 | 644 | 75646.72 | 1604601.50 |

### Gráfico

![Pregunta 4](graficos/p4.png)

Tres mapas de calor, uno debajo del otro, con un depósito por fila y un mes por columna. Cada celda es lo que generó ese depósito ese mes: arriba la cantidad de envíos, en el medio el costo de flete total en miles de dólares y abajo la distancia total recorrida en miles de kilómetros. Cuanto más oscura la celda, más alto el valor.

### Lectura

New York y Los Angeles son todos los meses los dos depósitos que más despachan (entre 558 y 694 envíos cada uno) y Singapore el que menos (entre 192 y 239), sin un mes pico: ningún depósito varía más de 120 envíos entre su mejor y su peor mes. El flete mantiene ese mismo orden todos los meses y los kilómetros también, salvo en octubre, cuando Chicago recorre apenas más que New York.

## Pregunta 5

¿Cuánto costo de flete total y cuánto costo de flete incumplido acumula cada país de destino, con qué tasa de demora, por trimestre? (para saber en qué destinos se está gastando plata en envíos que igual llegan tarde)

### SQL

```sql
SELECT de.pais_destino,
       t.trimestre,
       SUM(f.costo_flete_total) AS costo_flete_total,
       SUM(f.costo_flete_incumplido) AS costo_flete_incumplido,
       ROUND(100 * SUM(f.tasa_demora * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_demora_pct
FROM fact_entregas f
JOIN dim_destino de ON de.id_destino = f.id_destino
JOIN dim_tiempo t   ON t.id_tiempo = f.id_tiempo
GROUP BY de.pais_destino, t.trimestre
ORDER BY t.trimestre, costo_flete_incumplido DESC;
```

### Resultado

Primeras 17 de las 68 filas: los 17 países en el trimestre 1, de mayor a menor flete incumplido.

| pais_destino | trimestre | costo_flete_total | costo_flete_incumplido | tasa_demora_pct |
|---|---|---|---|---|
| United States | 1 | 379506.69 | 253015.68 | 57.3 |
| India | 1 | 194608.46 | 153245.08 | 69.6 |
| Canada | 1 | 142662.71 | 95871.27 | 59.4 |
| Pakistan | 1 | 102832.99 | 81898.31 | 69.4 |
| Australia | 1 | 99375.56 | 71749.73 | 61.9 |
| Japan | 1 | 72130.25 | 52479.19 | 63.0 |
| Singapore | 1 | 63791.33 | 47658.37 | 65.2 |
| Brazil | 1 | 53979.05 | 41755.86 | 66.9 |
| Saudi Arabia | 1 | 57227.97 | 40596.99 | 62.4 |
| United Kingdom | 1 | 78399.91 | 37712.37 | 45.3 |
| United Arab Emirates | 1 | 50708.00 | 35569.18 | 59.1 |
| Germany | 1 | 59134.02 | 31082.74 | 49.5 |
| France | 1 | 52194.94 | 27391.19 | 49.9 |
| Mexico | 1 | 17851.70 | 13378.97 | 62.3 |
| Netherlands | 1 | 25344.45 | 12673.87 | 44.9 |
| Italy | 1 | 26102.04 | 11790.38 | 44.8 |
| Spain | 1 | 24436.66 | 11066.44 | 43.1 |

### Gráfico

![Pregunta 5](graficos/p5.png)

Un cuadro por trimestre y una barra por país de destino. El largo de la barra es el costo de flete total en miles de dólares: la parte roja es el flete incumplido y la gris, el de los envíos que llegaron a tiempo. El número al final de cada barra es la tasa de demora del país en ese trimestre, es decir, el porcentaje de sus envíos que llegaron tarde. Los países están ordenados por su flete incumplido de todo el año, igual en los cuatro cuadros.

### Lectura

Estados Unidos acumula el mayor flete incumplido todos los trimestres (entre 245 y 259 mil dólares) porque es el que más flete paga, pero en proporción los peores son India, Pakistán y Brasil, que los cuatro trimestres pagan más de tres cuartos de su flete por envíos tardíos, con tasas de demora de 66 a 73 %, contra cerca de la mitad en los países de Europa.

## Pregunta 6

¿Qué rating promedio y qué tasa de devolución produce cada combinación de clima y método de envío, por trimestre? (para decidir qué modalidad conviene ofrecer cuando se espera mal tiempo)

### SQL

```sql
SELECT c.condicion_climatica AS clima,
       m.nombre_metodo AS metodo_envio,
       t.trimestre,
       SUM(f.cantidad_envios) AS envios,
       ROUND(SUM(f.rating_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS rating_promedio,
       ROUND(100 * SUM(f.tasa_devolucion * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_devolucion_pct
FROM fact_entregas f
JOIN dim_clima c        ON c.id_clima = f.id_clima
JOIN dim_metodo_envio m ON m.id_metodo_envio = f.id_metodo_envio
JOIN dim_tiempo t       ON t.id_tiempo = f.id_tiempo
GROUP BY c.condicion_climatica, m.nombre_metodo, t.trimestre
ORDER BY t.trimestre, rating_promedio, clima, metodo_envio;
```

### Resultado

Primeras 10 de las 120 filas: trimestre 1, de menor a mayor rating.

| clima | metodo_envio | trimestre | envios | rating_promedio | tasa_devolucion_pct |
|---|---|---|---|---|---|
| Snow | Economy | 1 | 120 | 2.67 | 28.3 |
| Snow | International | 1 | 404 | 2.69 | 21.8 |
| Storm | Economy | 1 | 138 | 2.71 | 21.7 |
| Storm | Standard | 1 | 432 | 2.72 | 22.0 |
| Storm | International | 1 | 390 | 2.74 | 24.4 |
| Snow | Standard | 1 | 409 | 2.78 | 23.2 |
| Snow | Express | 1 | 261 | 2.88 | 20.7 |
| Storm | Express | 1 | 251 | 2.94 | 22.7 |
| Rain | International | 1 | 711 | 3.05 | 19.4 |
| Extreme Heat | International | 1 | 256 | 3.17 | 21.1 |

### Gráfico

![Pregunta 6](graficos/p6.png)

Ocho mapas de calor: cada columna es un trimestre, de T1 a T4, y en cada cuadro el clima va en las filas y el método de envío en las columnas. Los cuatro de arriba muestran el rating promedio que dieron los clientes, en una escala de 1 a 5, en rojo los más bajos y en verde los más altos; los cuatro de abajo, la tasa de devolución, es decir, el porcentaje de envíos en los que el cliente pidió la devolución, en naranja más oscuro cuanto más alta.

### Lectura

Con nieve o tormenta el rating de Express, Standard, Economy e International baja a entre 2,59 y 3,08 y su tasa de devolución sube a entre 17,5 y 28,3 %, mientras que Same Day se mantiene entre 3,33 y 3,79 y es el mejor calificado en esos climas los cuatro trimestres. Su tasa de devolución, en cambio, salta mucho porque tiene entre 29 y 153 envíos por combinación, así que esa columna se lee con cuidado.
