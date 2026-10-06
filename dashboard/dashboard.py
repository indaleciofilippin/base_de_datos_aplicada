"""Dashboard: corre la consulta de cada pregunta del Paso 1 contra el modelo estrella de
entregas_dw y guarda su gráfico en la carpeta graficos.

Se corre desde esta carpeta, con el Data Mart ya cargado:
    ../.venv/bin/python dashboard.py
"""
import getpass
from decimal import Decimal
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd
import pymysql

HOST = '127.0.0.1'
PUERTO = 3306
CARPETA = Path(__file__).parent / 'graficos'

TRIMESTRES = {1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4'}
MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
METODOS = ['Same Day', 'Express', 'Standard', 'Economy', 'International']
PRIORIDADES = ['Low', 'Normal', 'High', 'Urgent']

P1 = """
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
"""

P2 = """
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
"""

P3 = """
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
"""

P4 = """
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
"""

P5 = """
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
"""

P6 = """
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
"""


def consultar(conexion, sql):
    """Corre la consulta y devuelve el resultado en un DataFrame, pasando los DECIMAL a float."""
    with conexion.cursor() as cursor:
        cursor.execute(sql)
        columnas = [c[0] for c in cursor.description]
        df = pd.DataFrame(cursor.fetchall(), columns=columnas)
    for c in df.columns:
        if isinstance(df[c].iloc[0], Decimal):
            df[c] = df[c].astype(float)
    return df


def mapa_de_calor(ax, valores, cmap, vmin, vmax, texto, tamano=7):
    """Dibuja la tabla como mapa de calor y escribe en cada celda el texto que devuelve texto(fila, columna)."""
    im = ax.imshow(valores.values, cmap=cmap, vmin=vmin, vmax=vmax, aspect='auto')
    ax.set_xticks(range(len(valores.columns)))
    ax.set_xticklabels(valores.columns)
    ax.set_yticks(range(len(valores.index)))
    ax.set_yticklabels(valores.index)
    ax.tick_params(length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for i, fila in enumerate(valores.index):
        for j, columna in enumerate(valores.columns):
            r, g, b, _ = im.cmap(im.norm(valores.loc[fila, columna]))
            oscuro = 0.299 * r + 0.587 * g + 0.114 * b < 0.5
            ax.text(j, i, texto(fila, columna), ha='center', va='center', fontsize=tamano,
                    color='white' if oscuro else 'black')
    return im


def grafico_p1(df):
    """P1: un par de mapas de calor por método de envío, a la izquierda la tasa de demora y a la derecha los días de demora."""
    tardios = (df['tasa_demora_pct'] * df['envios']).groupby(df['transportista']).sum()
    orden = (tardios / df.groupby('transportista')['envios'].sum()).sort_values().index
    fig, ejes = plt.subplots(len(METODOS), 2, figsize=(12, 22), sharey=True, layout='constrained')
    indicadores = [('tasa_demora_pct', 'Reds', 'tasa de demora (%)', 'tasa de demora y total de envíos', '%.1f %%\n%d envíos'),
                   ('dias_demora_promedio', 'Purples', 'días de demora promedio', 'días de demora promedio', '%.2f días')]
    for columna_ejes, (columna, cmap, etiqueta, corto, formato) in zip(ejes.T, indicadores):
        vmin, vmax = df[columna].min(), df[columna].max()
        for ax, metodo in zip(columna_ejes, METODOS):
            datos = df[df['metodo_envio'] == metodo]
            valores = datos.pivot(index='transportista', columns='trimestre', values=columna).loc[orden]
            envios = datos.pivot(index='transportista', columns='trimestre', values='envios').loc[orden]
            valores.columns = envios.columns = [TRIMESTRES[t] for t in valores.columns]
            if columna == 'tasa_demora_pct':
                texto = lambda f, c: formato % (valores.loc[f, c], envios.loc[f, c])
            else:
                texto = lambda f, c: formato % valores.loc[f, c]
            im = mapa_de_calor(ax, valores, cmap, vmin, vmax, texto, tamano=9)
            ax.set_title('%s · %s' % (metodo, corto), fontsize=10)
        fig.colorbar(im, ax=columna_ejes, location='bottom', shrink=0.8, aspect=40, pad=0.01, label=etiqueta)
    fig.suptitle('P1 · Tasa de demora y días de demora promedio por transportista, método de envío y trimestre')


def grafico_p2(df):
    """P2: por cada método de envío, una línea de días reales y otra de días prometidos, mes a mes."""
    fig, ax = plt.subplots(figsize=(11, 5.2))
    colores = plt.get_cmap('tab10').colors
    for color, metodo in zip(colores, METODOS):
        datos = df[df['metodo_envio'] == metodo].sort_values('mes')
        ax.plot(datos['mes'], datos['dias_reales_promedio'], color=color, marker='o',
                markersize=3, label=metodo + ', días reales')
        ax.plot(datos['mes'], datos['dias_prometidos_promedio'], color=color, linestyle='--',
                label=metodo + ', días prometidos')
    ax.set_xticks(range(1, 13))
    ax.set_xticklabels(MESES)
    ax.set_ylabel('días promedio')
    ax.set_ylim(0, None)
    ax.grid(axis='y', alpha=0.3)
    ax.legend(fontsize=8, loc='upper left', bbox_to_anchor=(1.01, 1), frameon=False)
    ax.set_title('P2 · Días prometidos y días reales de entrega por método de envío, mes a mes')


def grafico_p3(df):
    """P3: un mapa de calor de clima por prioridad para cada trimestre, arriba la tasa de demora y abajo los días de demora."""
    fig, ejes = plt.subplots(2, 4, figsize=(21, 9.5), sharey=True)
    indicadores = [('tasa_demora_pct', 'Reds', 'tasa de demora (%)', 'tasa de demora y total de envíos', '%.1f %%\n%d envíos'),
                   ('dias_demora_promedio', 'Purples', 'días de demora promedio', 'días de demora promedio', '%.2f días')]
    for fila_ejes, (columna, cmap, etiqueta, corto, formato) in zip(ejes, indicadores):
        vmin, vmax = df[columna].min(), df[columna].max()
        for ax, trimestre in zip(fila_ejes, sorted(df['trimestre'].unique())):
            datos = df[df['trimestre'] == trimestre]
            valores = datos.pivot(index='clima', columns='prioridad', values=columna)[PRIORIDADES]
            envios = datos.pivot(index='clima', columns='prioridad', values='envios')[PRIORIDADES]
            if columna == 'tasa_demora_pct':
                texto = lambda f, c: formato % (valores.loc[f, c], envios.loc[f, c])
            else:
                texto = lambda f, c: formato % valores.loc[f, c]
            im = mapa_de_calor(ax, valores, cmap, vmin, vmax, texto)
            ax.set_title('%s · %s' % (TRIMESTRES[trimestre], corto), fontsize=10)
        fig.colorbar(im, ax=fila_ejes, shrink=0.85, label=etiqueta)
    fig.suptitle('P3 · Tasa de demora y días de demora promedio por clima y prioridad de la orden, por trimestre',
                 x=0.45)


def grafico_p4(df):
    """P4: tres mapas de calor de depósito por mes, uno de envíos, otro de flete y otro de kilómetros."""
    df = df.assign(deposito=df['codigo_deposito'] + ' ' + df['ciudad_deposito'],
                   flete_miles=df['costo_flete_total'] / 1000,
                   km_miles=df['distancia_total_km'] / 1000)
    fig, ejes = plt.subplots(3, 1, figsize=(12, 14), sharex=True)
    indicadores = [('envios', 'Blues', 'envíos', '%d\nenvíos'),
                   ('flete_miles', 'Greens', 'costo de flete total (miles de USD)', '%.1f\nmil USD'),
                   ('km_miles', 'Purples', 'distancia total (miles de km)', '%.0f\nmil km')]
    for ax, (columna, cmap, etiqueta, formato) in zip(ejes, indicadores):
        valores = df.pivot(index='deposito', columns='mes', values=columna)
        valores.columns = MESES
        im = mapa_de_calor(ax, valores, cmap, valores.values.min(), valores.values.max(),
                           lambda f, c: formato % valores.loc[f, c])
        ax.set_title(etiqueta)
        fig.colorbar(im, ax=ax, shrink=0.9)
    fig.suptitle('P4 · Envíos, costo de flete y kilómetros por depósito de origen y mes', x=0.435, y=0.93)


def grafico_p5(df):
    """P5: barras por país con el flete incumplido y el flete a tiempo, un gráfico por trimestre."""
    total_pais = df.groupby('pais_destino')['costo_flete_incumplido'].sum().sort_values()
    fig, ejes = plt.subplots(1, 4, figsize=(16, 6), sharey=True, sharex=True)
    for ax, trimestre in zip(ejes, sorted(df['trimestre'].unique())):
        datos = df[df['trimestre'] == trimestre].set_index('pais_destino').loc[total_pais.index]
        incumplido = datos['costo_flete_incumplido'] / 1000
        cumplido = (datos['costo_flete_total'] - datos['costo_flete_incumplido']) / 1000
        ax.barh(datos.index, incumplido, color='#c0392b', label='flete incumplido')
        ax.barh(datos.index, cumplido, left=incumplido, color='#cfd8dc', label='flete de envíos a tiempo')
        for y, (pais, fila) in enumerate(datos.iterrows()):
            ax.text(fila['costo_flete_total'] / 1000 + 5, y, '%.0f %% de envíos tarde' % fila['tasa_demora_pct'],
                    va='center', fontsize=7)
        ax.set_title(TRIMESTRES[trimestre])
        ax.set_xlim(0, df['costo_flete_total'].max() / 1000 * 1.55)
        ax.set_xlabel('miles de USD')
        ax.grid(axis='x', alpha=0.3)
        for spine in ['top', 'right']:
            ax.spines[spine].set_visible(False)
    ejes[0].legend(loc='lower right', fontsize=8, frameon=False)
    fig.suptitle('P5 · Costo de flete total e incumplido y tasa de demora por país de destino y trimestre')
    fig.tight_layout()


def grafico_p6(df):
    """P6: un mapa de calor de clima por método de envío para cada trimestre, arriba el rating y abajo la tasa de devolución."""
    fig, ejes = plt.subplots(2, 4, figsize=(17, 8), sharey=True)
    indicadores = [('rating_promedio', 'RdYlGn', 'rating promedio', 'rating promedio', '%.2f'),
                   ('tasa_devolucion_pct', 'Oranges', 'tasa de devolución (%)', 'tasa de devolución', '%.1f %%')]
    for fila_ejes, (columna, cmap, etiqueta, corto, formato) in zip(ejes, indicadores):
        vmin, vmax = df[columna].min(), df[columna].max()
        for ax, trimestre in zip(fila_ejes, sorted(df['trimestre'].unique())):
            datos = df[df['trimestre'] == trimestre]
            valores = datos.pivot(index='clima', columns='metodo_envio', values=columna)[METODOS]
            im = mapa_de_calor(ax, valores, cmap, vmin, vmax,
                               lambda f, c: formato % valores.loc[f, c])
            ax.set_title('%s · %s' % (TRIMESTRES[trimestre], corto), fontsize=9)
            ax.tick_params(axis='x', labelrotation=30)
        fig.colorbar(im, ax=fila_ejes, shrink=0.85, label=etiqueta)
    for ax in ejes[0]:
        ax.tick_params(labelbottom=False)
    fig.suptitle('P6 · Rating promedio y tasa de devolución por clima, método de envío y trimestre', x=0.45)


def main():
    """Se conecta a entregas_dw, corre las seis consultas y guarda cada gráfico en la carpeta graficos."""
    conexion = pymysql.connect(host=HOST, port=PUERTO, user='root',
                               password=getpass.getpass('Contraseña de root de MySQL: '),
                               database='entregas_dw', charset='utf8mb4')
    CARPETA.mkdir(exist_ok=True)
    preguntas = [('p1', P1, grafico_p1), ('p2', P2, grafico_p2), ('p3', P3, grafico_p3),
                 ('p4', P4, grafico_p4), ('p5', P5, grafico_p5), ('p6', P6, grafico_p6)]
    for nombre, sql, graficar in preguntas:
        df = consultar(conexion, sql)
        graficar(df)
        plt.savefig(CARPETA / (nombre + '.png'), dpi=150, bbox_inches='tight')
        plt.close('all')
        print('%s: %d filas, gráfico en graficos/%s.png' % (nombre, len(df), nombre))
    conexion.close()


if __name__ == '__main__':
    main()
