"""Aplicación web del dashboard: las seis preguntas del Paso 1 con gráficos interactivos, filtros
que vuelven a consultar el Data Mart y una pestaña ETL con los controles del Paso 4.

Datos de conexión por variables de entorno: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD,
MYSQL_DATABASE (por defecto entregas_dw), MYSQL_SSL=1 para conectarse cifrado y, opcional,
MYSQL_SSL_CA con la ruta al certificado de la base.
"""
import ast
import os
import re
from pathlib import Path

import pymysql
from flask import Flask, jsonify, render_template, request

RAIZ = Path(__file__).resolve().parent.parent

# Filtros: parámetro de la URL -> (columna de fact_entregas, dimensión, campo de la dimensión)
FILTROS = {
    'trimestre': ('id_tiempo', 'dim_tiempo', 'trimestre'),
    'metodo': ('id_metodo_envio', 'dim_metodo_envio', 'nombre_metodo'),
    'transportista': ('id_transportista', 'dim_transportista', 'nombre_transportista'),
    'clima': ('id_clima', 'dim_clima', 'condicion_climatica'),
    'prioridad': ('id_prioridad', 'dim_prioridad', 'nombre_prioridad'),
    'deposito': ('id_deposito', 'dim_deposito', 'codigo_deposito'),
    'pais': ('id_destino', 'dim_destino', 'pais_destino'),
}

PROMEDIOS = """SUM(f.cantidad_envios) AS envios,
       ROUND(100 * SUM(f.tasa_demora * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_demora_pct,
       ROUND(SUM(f.dias_demora_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS dias_demora_promedio,
       SUM(f.costo_flete_total) AS costo_flete_total,
       SUM(f.costo_flete_incumplido) AS costo_flete_incumplido,
       ROUND(SUM(f.rating_promedio * f.cantidad_envios) / SUM(f.cantidad_envios), 2) AS rating_promedio,
       ROUND(100 * SUM(f.tasa_devolucion * f.cantidad_envios) / SUM(f.cantidad_envios), 1) AS tasa_devolucion_pct"""

TOTALES = 'SELECT ' + PROMEDIOS + '\nFROM fact_entregas f'

POR_MES = ('SELECT t.mes,\n       ' + PROMEDIOS +
           '\nFROM fact_entregas f\nJOIN dim_tiempo t ON t.id_tiempo = f.id_tiempo\nGROUP BY t.mes\nORDER BY t.mes')

COMO_SE_LEE = {
    1: 'Un mapa de calor por método de envío, con un transportista por fila (de menor a mayor demora) y un '
       'trimestre por columna. Arriba se elige qué mostrar en las celdas; al pasar el mouse por una celda '
       'aparecen la tasa de demora, los días de demora promedio y los envíos.',
    2: 'Una línea por método de envío y mes: la continua son los días reales de entrega promedio y la '
       'cortada, los días prometidos. Con "Días de más" se ve directamente la diferencia. Un clic en la '
       'leyenda oculta o muestra un método.',
    3: 'Un mapa de calor por trimestre, con el clima en las filas y la prioridad de la orden en las columnas. '
       'Las celdas muestran el indicador elegido; los envíos expuestos están en el detalle de cada celda.',
    4: 'Un mapa de calor con un depósito por fila y un mes por columna. Se elige si las celdas muestran '
       'envíos, costo de flete o kilómetros.',
    5: 'Un gráfico por trimestre, con una barra por país: la parte naranja es el flete incumplido y la gris, '
       'el flete de los envíos que llegaron a tiempo. El detalle de cada barra tiene la tasa de demora.',
    6: 'Un mapa de calor por trimestre, con el clima en las filas y el método de envío en las columnas. Se '
       'elige si las celdas muestran el rating promedio o la tasa de devolución.',
}

# Lecturas de dashboard.md con los nombres en castellano, como se ven en la pantalla
LECTURAS = {
    1: 'SwiftShip tiene la tasa de demora más baja en 13 de las 20 combinaciones de método y trimestre y '
       'GlobalExpress la más alta en 12, y en el método Internacional los días de demora acompañan (de 1,49 a '
       '1,71 contra 2,49 a 2,70). En Mismo día hay entre 42 y 75 envíos por combinación y el orden cambia cada '
       'trimestre, así que ahí los datos no alcanzan para decidir.',
    2: 'En los cinco métodos y los doce meses se tarda más de lo prometido, con una diferencia casi fija para cada '
       'método (de 0,21 a 0,36 días en Mismo día hasta 1,75 a 1,99 en Internacional), así que el problema no es de '
       'ejecución en un mes puntual sino una promesa calibrada de menos.',
    3: 'Con cielo despejado la prioridad hace la diferencia (se demora entre el 64,8 y el 69,5 % de los envíos de '
       'prioridad baja y entre el 4,5 y el 6,4 % de los urgentes), pero con nieve o tormenta llega tarde entre el '
       '84,5 y el 99,5 % de los envíos de prioridad baja, normal y alta, y aun entre el 64,6 y el 77,5 % de los '
       'urgentes. Cada trimestre quedan expuestos a nieve o tormenta entre 2.410 y 2.529 envíos, y el cuadro se '
       'repite casi igual los cuatro trimestres.',
    4: 'Nueva York y Los Ángeles son todos los meses los dos depósitos que más despachan (entre 558 y 694 envíos '
       'cada uno) y Singapur el que menos (entre 192 y 239), sin un mes pico: ningún depósito varía más de 120 '
       'envíos entre su mejor y su peor mes. El flete mantiene ese mismo orden todos los meses y los kilómetros '
       'también, salvo en octubre, cuando Chicago recorre apenas más que Nueva York.',
    5: 'Estados Unidos acumula el mayor flete incumplido todos los trimestres (entre 245 y 259 mil dólares) porque '
       'es el que más flete paga, pero en proporción los peores son India, Pakistán y Brasil, que los cuatro '
       'trimestres pagan más de tres cuartos de su flete por envíos tardíos, con tasas de demora de 66 a 73 %, '
       'contra cerca de la mitad en los países de Europa.',
    6: 'Con nieve o tormenta el rating de los métodos Exprés, Estándar, Económico e Internacional baja a entre 2,59 '
       'y 3,08 y su tasa de devolución sube a entre 17,5 y 28,3 %, mientras que Mismo día se mantiene entre 3,33 y '
       '3,79 y es el mejor calificado en esos climas los cuatro trimestres. Su tasa de devolución, en cambio, salta '
       'mucho porque tiene entre 29 y 153 envíos por combinación, así que esa columna se lee con cuidado.',
}

# Nombres en castellano para la pestaña ETL
TABLAS = {
    'stg_entregas': 'El archivo tal como entró', 'stg_limpia': 'El archivo limpio',
    'stg_limpia descartadas': 'Filas descartadas', 'dim_tiempo': 'Días del calendario',
    'dim_transportista': 'Transportistas', 'dim_metodo_envio': 'Métodos de envío', 'dim_prioridad': 'Prioridades',
    'dim_clima': 'Climas', 'dim_deposito': 'Depósitos', 'dim_destino': 'Ciudades de destino',
    'fact_entregas': 'Filas de la tabla de hechos',
}
COLUMNAS_ETL = {
    'origen': 'Origen', 'envios': 'Envíos', 'envios_tardios': 'Envíos tardíos', 'dias_de_demora': 'Días de demora',
    'costo_flete_total': 'Costo de flete total (US$)', 'costo_flete_incumplido': 'Costo de flete incumplido (US$)',
    'distancia_total_km': 'Distancia total (km)',
}

app = Flask(__name__)


@app.template_filter('numero')
def numero(texto):
    """Escribe un número como se usa en castellano: punto para los miles y coma para los decimales."""
    entero, _, decimales = texto.partition('.')
    entero = '{:,}'.format(int(entero)).replace(',', '.')
    return entero + (',' + decimales if decimales else '')


def consultas_del_dashboard():
    """Lee P1 a P6 de dashboard.py sin importarlo, para no cargar pandas ni matplotlib en el servidor."""
    arbol = ast.parse((RAIZ / 'dashboard' / 'dashboard.py').read_text(encoding='utf-8'))
    consultas = {}
    for nodo in arbol.body:
        if isinstance(nodo, ast.Assign) and re.fullmatch(r'P[1-6]', nodo.targets[0].id):
            consultas[int(nodo.targets[0].id[1])] = ast.literal_eval(nodo.value).strip().rstrip(';')
    return consultas


def textos_del_dashboard():
    """Toma de dashboard.md el texto de cada pregunta."""
    md = (RAIZ / 'dashboard' / 'dashboard.md').read_text(encoding='utf-8')
    textos = {}
    for bloque in re.split(r'^## Pregunta ', md, flags=re.M)[1:]:
        numero, resto = bloque.split('\n', 1)
        secciones = re.split(r'^### ', resto, flags=re.M)
        textos[int(numero)] = {'pregunta': secciones[0].strip()}
    return textos


def consultas_de_verificacion():
    """Toma de 05_verificacion.sql la consulta de filas por tabla y la de conciliación."""
    sql = (RAIZ / 'paso-4' / '05_verificacion.sql').read_text(encoding='utf-8')
    filas = re.search(r'-- Filas por tabla\n(.*?);', sql, flags=re.S).group(1)
    conciliacion = re.search(r'-- Conciliación[^\n]*\n(.*?);', sql, flags=re.S).group(1)
    return filas.strip(), conciliacion.strip()


CONSULTAS = consultas_del_dashboard()
TEXTOS = textos_del_dashboard()


def conectar():
    """Abre una conexión al Data Mart con los datos de las variables de entorno."""
    ssl = None
    if os.environ.get('MYSQL_SSL') == '1':
        ca = os.environ.get('MYSQL_SSL_CA')
        ssl = {'ca': ca} if ca else {'verify_mode': False}
    return pymysql.connect(host=os.environ.get('MYSQL_HOST', '127.0.0.1'),
                           port=int(os.environ.get('MYSQL_PORT', 3306)),
                           user=os.environ.get('MYSQL_USER', 'root'),
                           password=os.environ.get('MYSQL_PASSWORD', ''),
                           database=os.environ.get('MYSQL_DATABASE', 'entregas_dw'),
                           charset='utf8mb4', ssl=ssl)


def filtro_where(args):
    """Arma el WHERE de los filtros elegidos. Los valores van como parámetros, nunca pegados al SQL."""
    condiciones, parametros = [], []
    for nombre, (columna, tabla, campo) in FILTROS.items():
        valores = [v for v in args.getlist(nombre) if v][:200]
        if valores:
            marcas = ', '.join(['%s'] * len(valores))
            condiciones.append('f.%s IN (SELECT %s FROM %s WHERE %s IN (%s))' % (columna, columna, tabla, campo, marcas))
            parametros.extend(valores)
    if not condiciones:
        return '', []
    return 'WHERE ' + '\n  AND '.join(condiciones), parametros


def con_filtro(sql, where):
    """Agrega el WHERE antes del GROUP BY (o al final si la consulta no agrupa)."""
    if not where:
        return sql
    if '\nGROUP BY' in sql:
        return sql.replace('\nGROUP BY', '\n' + where + '\nGROUP BY', 1)
    return sql + '\n' + where


def ejecutar(cursor, sql, parametros=()):
    """Corre una consulta y devuelve el SQL tal como se ejecutó, las columnas y las filas como texto."""
    cursor.execute(sql, parametros)
    columnas = [c[0] for c in cursor.description]
    filas = [['' if v is None else str(v) for v in fila] for fila in cursor.fetchall()]
    return {'sql': cursor.mogrify(sql, parametros) + ';', 'columnas': columnas, 'filas': filas}


@app.route('/')
def inicio():
    return render_template('dashboard.html', pagina='dashboard', textos=TEXTOS, como_se_lee=COMO_SE_LEE,
                           lecturas=LECTURAS)


@app.route('/etl')
def etl():
    sql_filas, sql_conciliacion = consultas_de_verificacion()
    with conectar() as conexion, conexion.cursor() as cursor:
        filas = ejecutar(cursor, sql_filas)
        conciliacion = ejecutar(cursor, sql_conciliacion)
    coincide = len({tuple(f[1:]) for f in conciliacion['filas']}) == 1
    return render_template('etl.html', pagina='etl', filas=filas, conciliacion=conciliacion, coincide=coincide,
                           tablas=TABLAS, columnas=COLUMNAS_ETL)


@app.route('/api/opciones')
def opciones():
    """Los valores posibles de cada filtro, sacados de las dimensiones."""
    orden = {
        'trimestre': 'SELECT DISTINCT trimestre FROM dim_tiempo ORDER BY trimestre',
        'metodo': "SELECT nombre_metodo FROM dim_metodo_envio ORDER BY FIELD(nombre_metodo, "
                  "'Same Day', 'Express', 'Standard', 'Economy', 'International'), nombre_metodo",
        'transportista': 'SELECT nombre_transportista FROM dim_transportista ORDER BY nombre_transportista',
        'clima': 'SELECT condicion_climatica FROM dim_clima ORDER BY condicion_climatica',
        'prioridad': "SELECT nombre_prioridad FROM dim_prioridad ORDER BY FIELD(nombre_prioridad, "
                     "'Low', 'Normal', 'High', 'Urgent'), nombre_prioridad",
        'deposito': 'SELECT codigo_deposito, ciudad_deposito FROM dim_deposito ORDER BY codigo_deposito',
        'pais': 'SELECT DISTINCT pais_destino FROM dim_destino ORDER BY pais_destino',
    }
    resultado = {}
    with conectar() as conexion, conexion.cursor() as cursor:
        for nombre, sql in orden.items():
            cursor.execute(sql)
            resultado[nombre] = [{'valor': str(f[0]), 'etiqueta': str(f[-1])} for f in cursor.fetchall()]
    return jsonify(resultado)


@app.route('/api/datos')
def datos():
    """Los indicadores, la evolución mensual y el resultado de las seis preguntas con los filtros elegidos."""
    where, parametros = filtro_where(request.args)
    with conectar() as conexion, conexion.cursor() as cursor:
        respuesta = {
            'totales': ejecutar(cursor, con_filtro(TOTALES, where), parametros),
            'por_mes': ejecutar(cursor, con_filtro(POR_MES, where), parametros),
            'preguntas': {n: ejecutar(cursor, con_filtro(sql, where), parametros) for n, sql in CONSULTAS.items()},
        }
    return jsonify(respuesta)
