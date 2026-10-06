'use strict';

// Orden fijo de las categorías: los colores siguen al método, nunca a su posición en el filtro
const METODOS = ['Same Day', 'Express', 'Standard', 'Economy', 'International'];
const PRIORIDADES = ['Low', 'Normal', 'High', 'Urgent'];
// Climas de menos a más severo
const CLIMAS = ['Clear', 'Cloudy', 'Extreme Heat', 'Rain', 'Storm', 'Snow'];
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre',
                      'Octubre', 'Noviembre', 'Diciembre'];

// En la base los valores están como vienen en el archivo; en pantalla se muestran en castellano
const NOMBRES = {
  metodo: { 'Same Day': 'Mismo día', Express: 'Exprés', Standard: 'Estándar', Economy: 'Económico',
            International: 'Internacional' },
  prioridad: { Low: 'Baja', Normal: 'Normal', High: 'Alta', Urgent: 'Urgente' },
  clima: { Clear: 'Despejado', Cloudy: 'Nublado', 'Extreme Heat': 'Calor extremo', Rain: 'Lluvia', Snow: 'Nieve',
           Storm: 'Tormenta' },
  pais: { 'United States': 'Estados Unidos', India: 'India', Canada: 'Canadá', Pakistan: 'Pakistán',
          Australia: 'Australia', Japan: 'Japón', Singapore: 'Singapur', 'United Kingdom': 'Reino Unido',
          Brazil: 'Brasil', 'Saudi Arabia': 'Arabia Saudita', 'United Arab Emirates': 'Emiratos Árabes Unidos',
          Germany: 'Alemania', France: 'Francia', Mexico: 'México', Italy: 'Italia', Netherlands: 'Países Bajos',
          Spain: 'España' },
  ciudad: { 'New York': 'Nueva York', 'Los Angeles': 'Los Ángeles', Chicago: 'Chicago', Toronto: 'Toronto',
            London: 'Londres', Berlin: 'Berlín', Paris: 'París', Sydney: 'Sídney', Dubai: 'Dubái',
            Singapore: 'Singapur' },
};
const es = (tipo, valor) => (NOMBRES[tipo] && NOMBRES[tipo][valor]) || valor;

// Encabezados de las tablas y qué traducción usa cada columna
const COLUMNAS = {
  transportista: ['Transportista'], metodo_envio: ['Método de envío', 'metodo'], trimestre: ['Trimestre', 'trimestre'],
  envios: ['Envíos'], tasa_demora_pct: ['Tasa de demora (%)'], dias_demora_promedio: ['Días de demora promedio'],
  mes: ['Mes', 'mes'], dias_prometidos_promedio: ['Días prometidos promedio'], dias_reales_promedio: ['Días reales promedio'],
  clima: ['Clima', 'clima'], prioridad: ['Prioridad', 'prioridad'], codigo_deposito: ['Depósito'],
  ciudad_deposito: ['Ciudad del depósito', 'ciudad'], costo_flete_total: ['Costo de flete total (US$)'],
  distancia_total_km: ['Distancia total (km)'], pais_destino: ['País de destino', 'pais'],
  costo_flete_incumplido: ['Costo de flete incumplido (US$)'], rating_promedio: ['Rating promedio'],
  tasa_devolucion_pct: ['Tasa de devolución (%)'],
};

function textoDeCelda(columna, valor) {
  const tipo = (COLUMNAS[columna] || [])[1];
  if (tipo === 'trimestre') return 'T' + valor;
  if (tipo === 'mes') return MESES_LARGOS[Number(valor) - 1];
  if (tipo) return es(tipo, valor);
  if (esNumero(valor)) return formato(Number(valor), (valor.split('.')[1] || '').length);
  return valor;
}

const DESPLEGABLES = [
  ['metodo', 'Método de envío'], ['transportista', 'Transportista'], ['clima', 'Clima'],
  ['prioridad', 'Prioridad'], ['deposito', 'Depósito'], ['pais', 'País de destino'],
];
const CLAVES = ['trimestre'].concat(DESPLEGABLES.map(d => d[0]));

const TITULOS = {
  1: 'Transportistas', 2: 'Plazo prometido y real', 3: 'Clima y prioridad',
  4: 'Carga de cada depósito', 5: 'Flete incumplido por país', 6: 'Rating y devoluciones',
};
const VISTAS = {
  mes: [['envios', 'Envíos'], ['tasa', 'Tasa de demora'], ['dias', 'Días de demora'], ['flete', 'Flete total'],
        ['incumplido', 'Flete incumplido'], ['rating', 'Rating'], ['devolucion', 'Devolución']],
  1: [['tasa', 'Tasa de demora'], ['dias', 'Días de demora'], ['envios', 'Envíos']],
  2: [['dias', 'Días prometidos y reales'], ['diferencia', 'Días de más']],
  3: [['tasa', 'Tasa de demora'], ['dias', 'Días de demora'], ['envios', 'Envíos expuestos']],
  4: [['envios', 'Envíos'], ['flete', 'Flete'], ['km', 'Kilómetros']],
  5: [['incumplido', 'Ordenar por flete incumplido'], ['porcentaje', 'Ordenar por % incumplido']],
  6: [['rating', 'Rating promedio'], ['devolucion', 'Tasa de devolución']],
};

const estado = {
  filtros: leerFiltros(),
  vistas: { mes: 'envios', 1: 'tasa', 2: 'dias', 3: 'tasa', 4: 'envios', 5: 'incumplido', 6: 'rating' },
  datos: null,
  pendientes: new Set(),
};

// ---------- utilidades ----------

const formato = (v, decimales) => new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: decimales, maximumFractionDigits: decimales,
}).format(v);
const dolares = v => 'US$ ' + formato(v, 0);
const millones = v => 'US$ ' + formato(v / 1e6, 2) + ' M';
const esNumero = s => /^-?\d+(\.\d+)?$/.test(s);
const unicos = lista => Array.from(new Set(lista));

function objetos(resultado) {
  return resultado.filas.map(fila => Object.fromEntries(
    resultado.columnas.map((c, i) => [c, esNumero(fila[i]) ? Number(fila[i]) : fila[i]])));
}

function leerFiltros() {
  const parametros = new URLSearchParams(location.search);
  return Object.fromEntries(CLAVES.map(c => [c, new Set(parametros.getAll(c))]));
}

function consultaDeFiltros() {
  const parametros = new URLSearchParams();
  CLAVES.forEach(c => estado.filtros[c].forEach(v => parametros.append(c, v)));
  return parametros.toString();
}

function hayFiltros() {
  return CLAVES.some(c => estado.filtros[c].size > 0);
}

function tema() {
  const css = getComputedStyle(document.documentElement);
  const v = nombre => css.getPropertyValue(nombre).trim();
  const oscuro = matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    texto: v('--texto'), texto2: v('--texto-2'), apagado: v('--apagado'), linea: v('--linea'),
    base: v('--base'), superficie: v('--superficie'), gris: v('--gris-barra'),
    series: [v('--serie-1'), v('--serie-2'), v('--serie-3'), v('--serie-4'), v('--serie-5')],
    // Secuencial de un solo tono: claro = poco, oscuro = mucho (en modo oscuro, al revés)
    escala: oscuro
      ? [[0, '#104281'], [0.2, '#1c5cab'], [0.4, '#2a78d6'], [0.6, '#5598e7'], [0.8, '#9ec5f4'], [1, '#e6f0fd']]
      : [[0, '#e6f0fd'], [0.2, '#b7d3f6'], [0.4, '#6da7ec'], [0.6, '#2a78d6'], [0.8, '#1c5cab'], [1, '#0d366b']],
  };
}

function disenoBase(t, extra) {
  return Object.assign({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', size: 12.5, color: t.texto2 },
    margin: { l: 70, r: 20, t: 36, b: 48 },
    separators: ',.',
    hoverlabel: { bgcolor: t.superficie, bordercolor: t.linea, font: { color: t.texto, size: 13 } },
  }, extra);
}

const CONFIG = { displayModeBar: false, responsive: true };

function columnasSegunAncho(div, maximo) {
  const ancho = div.clientWidth || 900;
  if (ancho < 640) return 1;
  if (ancho < 980) return Math.min(2, maximo);
  return Math.min(3, maximo);
}

function colorEnEscala(escala, x) {
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  for (let i = 1; i < escala.length; i++) {
    if (x <= escala[i][0] || i === escala.length - 1) {
      const [a, b] = [escala[i - 1], escala[i]];
      const p = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
      const [ca, cb] = [hex(a[1]), hex(b[1])];
      return ca.map((c, k) => c + (cb[k] - c) * p);
    }
  }
}

function textoSobre(rgb) {
  const [r, g, b] = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#111111' : '#ffffff';
}

function sufijoEje(i) {
  return i === 0 ? '' : String(i + 1);
}

// Varios mapas de calor con la misma escala de color, uno por faceta
function mapasDeCalor(div, facetas, opciones) {
  const t = tema();
  const columnas = Math.min(opciones.columnas || columnasSegunAncho(div, facetas.length), facetas.length);
  const filas = Math.ceil(facetas.length / columnas);
  const valores = facetas.flatMap(f => f.z.flat()).filter(v => v !== null);
  const [minimo, maximo] = [Math.min(...valores), Math.max(...valores)];
  const angosto = (div.clientWidth || 900) < 640;
  const izquierda = angosto ? Math.min(opciones.margenIzquierdo || 110, 96) : (opciones.margenIzquierdo || 110);
  const anchoCelda = ((div.clientWidth || 900) - izquierda - (angosto ? 16 : 110)) / columnas / Math.max(...facetas.map(f => f.x.length));
  const conTexto = anchoCelda >= 42;
  const abajo = angosto ? 120 : 40;
  const trazos = [];
  const anotaciones = [];
  const diseno = disenoBase(t, {
    height: filas * opciones.altoFaceta + abajo,
    grid: { rows: filas, columns: columnas, pattern: 'independent', xgap: 0.08, ygap: filas > 1 ? 0.24 : 0 },
    coloraxis: {
      colorscale: t.escala,
      cmin: minimo,
      cmax: maximo,
      colorbar: angosto
        ? { orientation: 'h', x: 0.5, xanchor: 'center', y: 0, yanchor: 'bottom', yref: 'container', thickness: 10,
            len: 0.9, outlinewidth: 0, title: { text: opciones.tituloEscala, side: 'top' }, tickfont: { color: t.texto2 } }
        : { title: { text: opciones.tituloEscala, side: 'right' }, thickness: 12, outlinewidth: 0,
            tickfont: { color: t.texto2 }, len: 0.9 },
    },
    margin: { l: izquierda, r: angosto ? 8 : 20, t: 34, b: abajo },
  });
  facetas.forEach((f, i) => {
    const s = sufijoEje(i);
    trazos.push({
      type: 'heatmap', x: f.x, y: f.y, z: f.z, customdata: f.detalle,
      xgap: 2, ygap: 2, coloraxis: 'coloraxis', hoverongaps: false,
      hovertemplate: opciones.hover + '<extra>' + f.titulo + '</extra>',
      xaxis: 'x' + s, yaxis: 'y' + s,
    });
    const ultimaFila = columnas === 1 || i + columnas >= facetas.length;
    diseno['xaxis' + s] = { type: 'category', side: 'bottom', tickfont: { color: t.texto2 }, showgrid: false,
                            zeroline: false, ticks: '', tickangle: opciones.anguloX ?? 'auto',
                            showticklabels: !opciones.etiquetasXAbajo || ultimaFila };
    diseno['yaxis' + s] = { type: 'category', autorange: 'reversed', tickfont: { color: t.texto2, size: angosto ? 10.5 : 12.5 }, showgrid: false,
                            zeroline: false, ticks: '', automargin: true, showticklabels: i % columnas === 0 };
    f.y.forEach((y, a) => f.x.forEach((x, b) => {
      const v = f.z[a][b];
      if (v === null || !conTexto) return;
      const color = textoSobre(colorEnEscala(t.escala, maximo > minimo ? (v - minimo) / (maximo - minimo) : 0));
      anotaciones.push({ text: f.texto[a][b], x, y, xref: 'x' + s, yref: 'y' + s, showarrow: false,
                         font: { size: opciones.tamanoTexto || 11, color } });
    }));
    anotaciones.push({
      text: '<b>' + f.titulo + '</b>', showarrow: false, xref: 'x' + s + ' domain', yref: 'y' + s + ' domain',
      x: 0, y: 1, xanchor: 'left', yanchor: 'bottom', yshift: 4, font: { size: 13.5, color: t.texto },
    });
  });
  diseno.annotations = anotaciones;
  Plotly.react(div, trazos, diseno, CONFIG);
}

function matriz(filasY, columnasX, buscar) {
  return filasY.map(y => columnasX.map(x => buscar(y, x)));
}

// ---------- gráficos de cada pregunta ----------

const DIBUJAR = {
  1(div, r) {
    const filas = objetos(r);
    const vista = estado.vistas[1];
    const peso = {};
    filas.forEach(f => {
      peso[f.transportista] = peso[f.transportista] || [0, 0];
      peso[f.transportista][0] += f.tasa_demora_pct * f.envios;
      peso[f.transportista][1] += f.envios;
    });
    const transportistas = Object.keys(peso).sort((a, b) => peso[a][0] / peso[a][1] - peso[b][0] / peso[b][1]);
    const trimestres = unicos(filas.map(f => f.trimestre)).sort();
    const x = trimestres.map(q => 'T' + q);
    const metodos = METODOS.filter(m => filas.some(f => f.metodo_envio === m));
    const campo = { tasa: 'tasa_demora_pct', dias: 'dias_demora_promedio', envios: 'envios' }[vista];
    const texto = { tasa: v => formato(v, 1) + ' %', dias: v => formato(v, 2), envios: v => formato(v, 0) }[vista];
    const facetas = metodos.map(m => {
      const celda = (y, q) => filas.find(f => f.metodo_envio === m && f.transportista === y && f.trimestre === q);
      return {
        titulo: es('metodo', m), x, y: transportistas,
        z: matriz(transportistas, trimestres, (y, q) => { const c = celda(y, q); return c ? c[campo] : null; }),
        texto: matriz(transportistas, trimestres, (y, q) => { const c = celda(y, q); return c ? texto(c[campo]) : ''; }),
        detalle: matriz(transportistas, trimestres, (y, q) => {
          const c = celda(y, q); return c ? [c.tasa_demora_pct, c.dias_demora_promedio, c.envios] : null;
        }),
      };
    });
    mapasDeCalor(div, facetas, {
      altoFaceta: 300, margenIzquierdo: 130,
      tituloEscala: { tasa: 'Tasa de demora (%)', dias: 'Días de demora', envios: 'Envíos' }[vista],
      hover: '<b>%{y}</b> · %{x}<br>Tasa de demora: %{customdata[0]:.1f} %<br>' +
             'Días de demora promedio: %{customdata[1]:.2f}<br>Envíos: %{customdata[2]:,}',
    });
  },

  2(div, r) {
    const t = tema();
    const filas = objetos(r);
    const vista = estado.vistas[2];
    const trazos = [];
    METODOS.forEach((m, i) => {
      const datos = filas.filter(f => f.metodo_envio === m).sort((a, b) => a.mes - b.mes);
      if (!datos.length) return;
      const color = t.series[i];
      const nombre = es('metodo', m);
      const x = datos.map(f => MESES[f.mes - 1]);
      if (vista === 'dias') {
        trazos.push({ type: 'scatter', mode: 'lines+markers', name: nombre, legendgroup: m, x,
                      y: datos.map(f => f.dias_reales_promedio), line: { color, width: 2 },
                      marker: { size: 8, color, line: { color: t.superficie, width: 2 } },
                      hovertemplate: nombre + ', real: %{y:.2f} días<extra></extra>' });
        trazos.push({ type: 'scatter', mode: 'lines', name: nombre + ' (prometido)', legendgroup: m, showlegend: false, x,
                      y: datos.map(f => f.dias_prometidos_promedio), line: { color, width: 2, dash: 'dash' },
                      hovertemplate: nombre + ', prometido: %{y:.2f} días<extra></extra>' });
      } else {
        trazos.push({ type: 'scatter', mode: 'lines+markers', name: nombre, x,
                      y: datos.map(f => f.dias_reales_promedio - f.dias_prometidos_promedio),
                      line: { color, width: 2 }, marker: { size: 8, color, line: { color: t.superficie, width: 2 } },
                      hovertemplate: nombre + ': %{y:.2f} días de más<extra></extra>' });
      }
    });
    Plotly.react(div, trazos, disenoBase(t, {
      height: 440,
      hovermode: 'x unified',
      legend: { orientation: 'h', y: 1.02, yanchor: 'bottom', x: 0, font: { color: t.texto2 } },
      xaxis: { categoryorder: 'array', categoryarray: MESES, showgrid: false, linecolor: t.base, tickfont: { color: t.texto2 } },
      yaxis: { title: { text: vista === 'dias' ? 'Días promedio' : 'Días reales menos prometidos' },
               gridcolor: t.linea, zeroline: true, zerolinecolor: t.base, rangemode: 'tozero', tickfont: { color: t.texto2 } },
      margin: { l: 70, r: 20, t: 60, b: 40 },
    }), CONFIG);
  },

  3(div, r) {
    const filas = objetos(r);
    const vista = estado.vistas[3];
    const climas = CLIMAS.filter(c => filas.some(f => f.clima === c));
    const prioridades = PRIORIDADES.filter(p => filas.some(f => f.prioridad === p));
    const trimestres = unicos(filas.map(f => f.trimestre)).sort();
    const campo = { tasa: 'tasa_demora_pct', dias: 'dias_demora_promedio', envios: 'envios' }[vista];
    const texto = { tasa: v => formato(v, 1) + ' %', dias: v => formato(v, 2), envios: v => formato(v, 0) }[vista];
    const facetas = trimestres.map(q => {
      const celda = (y, p) => filas.find(f => f.trimestre === q && f.clima === y && f.prioridad === p);
      return {
        titulo: 'T' + q, x: prioridades.map(p => es('prioridad', p)), y: climas.map(c => es('clima', c)),
        z: matriz(climas, prioridades, (y, p) => { const c = celda(y, p); return c ? c[campo] : null; }),
        texto: matriz(climas, prioridades, (y, p) => { const c = celda(y, p); return c ? texto(c[campo]) : ''; }),
        detalle: matriz(climas, prioridades, (y, p) => {
          const c = celda(y, p); return c ? [c.tasa_demora_pct, c.dias_demora_promedio, c.envios] : null;
        }),
      };
    });
    mapasDeCalor(div, facetas, {
      altoFaceta: 280, columnas: Math.min(columnasSegunAncho(div, 4) === 3 ? 4 : columnasSegunAncho(div, 4), facetas.length),
      tituloEscala: { tasa: 'Tasa de demora (%)', dias: 'Días de demora', envios: 'Envíos' }[vista],
      hover: '<b>%{y}</b> · prioridad %{x}<br>Tasa de demora: %{customdata[0]:.1f} %<br>' +
             'Días de demora promedio: %{customdata[1]:.2f}<br>Envíos expuestos: %{customdata[2]:,}',
    });
  },

  4(div, r) {
    const filas = objetos(r);
    const vista = estado.vistas[4];
    const etiqueta = f => f.codigo_deposito + ' ' + es('ciudad', f.ciudad_deposito);
    const depositos = unicos(filas.map(etiqueta)).sort();
    const meses = unicos(filas.map(f => f.mes)).sort((a, b) => a - b);
    const campo = { envios: 'envios', flete: 'costo_flete_total', km: 'distancia_total_km' }[vista];
    const escala = { envios: 1, flete: 1000, km: 1000 }[vista];
    const celda = (y, m) => filas.find(f => etiqueta(f) === y && f.mes === m);
    mapasDeCalor(div, [{
      titulo: { envios: 'Envíos', flete: 'Costo de flete (miles de US$)', km: 'Distancia recorrida (miles de km)' }[vista],
      x: meses.map(m => MESES[m - 1]), y: depositos,
      z: matriz(depositos, meses, (y, m) => { const c = celda(y, m); return c ? c[campo] / escala : null; }),
      texto: matriz(depositos, meses, (y, m) => {
        const c = celda(y, m); return c ? formato(c[campo] / escala, vista === 'flete' ? 1 : 0) : '';
      }),
      detalle: matriz(depositos, meses, (y, m) => {
        const c = celda(y, m); return c ? [c.envios, c.costo_flete_total, c.distancia_total_km] : null;
      }),
    }], {
      columnas: 1, altoFaceta: 460, margenIzquierdo: 150,
      tituloEscala: { envios: 'Envíos', flete: 'Miles de US$', km: 'Miles de km' }[vista],
      hover: '<b>%{y}</b> · %{x}<br>Envíos: %{customdata[0]:,}<br>Costo de flete: US$ %{customdata[1]:,.2f}<br>' +
             'Distancia: %{customdata[2]:,.0f} km',
    });
  },

  5(div, r) {
    const t = tema();
    const filas = objetos(r);
    const vista = estado.vistas[5];
    const trimestres = unicos(filas.map(f => f.trimestre)).sort();
    const anual = {};
    filas.forEach(f => {
      anual[f.pais_destino] = anual[f.pais_destino] || [0, 0];
      anual[f.pais_destino][0] += f.costo_flete_incumplido;
      anual[f.pais_destino][1] += f.costo_flete_total;
    });
    const clave = p => vista === 'incumplido' ? anual[p][0] : anual[p][0] / anual[p][1];
    const paises = Object.keys(anual).sort((a, b) => clave(a) - clave(b));
    const columnas = Math.min(columnasSegunAncho(div, trimestres.length) >= 2 ? 2 : 1, trimestres.length);
    const filasGrilla = Math.ceil(trimestres.length / columnas);
    const maximo = Math.max(...filas.map(f => f.costo_flete_total)) / 1000;
    const trazos = [];
    const diseno = disenoBase(t, {
      height: filasGrilla * (paises.length * 24 + 70) + 50,
      barmode: 'stack', bargap: 0.25,
      grid: { rows: filasGrilla, columns: columnas, pattern: 'independent', xgap: 0.12, ygap: 0.2 },
      legend: { orientation: 'h', y: 1.04, x: 0, yanchor: 'bottom', font: { color: t.texto2 } },
      margin: { l: 150, r: 30, t: 50, b: 40 },
      annotations: [],
    });
    trimestres.forEach((q, i) => {
      const s = sufijoEje(i);
      const datos = paises.map(p => filas.find(f => f.pais_destino === p && f.trimestre === q) || null);
      const detalle = datos.map(f => f ? [f.costo_flete_total, f.costo_flete_incumplido,
        100 * f.costo_flete_incumplido / f.costo_flete_total, f.tasa_demora_pct] : null);
      const hover = '<b>%{y}</b> · T' + q + '<br>Flete total: US$ %{customdata[0]:,.0f}<br>' +
                    'Flete incumplido: US$ %{customdata[1]:,.0f} (%{customdata[2]:.1f} %)<br>' +
                    'Tasa de demora: %{customdata[3]:.1f} %<extra></extra>';
      trazos.push({ type: 'bar', orientation: 'h', name: 'Flete incumplido', legendgroup: 'inc', showlegend: i === 0,
                    y: paises.map(p => es('pais', p)), x: datos.map(f => f ? f.costo_flete_incumplido / 1000 : null), customdata: detalle,
                    marker: { color: t.series[1], line: { width: 0 } }, hovertemplate: hover, xaxis: 'x' + s, yaxis: 'y' + s });
      trazos.push({ type: 'bar', orientation: 'h', name: 'Flete de envíos a tiempo', legendgroup: 'cum', showlegend: i === 0,
                    y: paises.map(p => es('pais', p)), x: datos.map(f => f ? (f.costo_flete_total - f.costo_flete_incumplido) / 1000 : null),
                    customdata: detalle, marker: { color: t.gris, line: { width: 0 } }, hovertemplate: hover,
                    xaxis: 'x' + s, yaxis: 'y' + s });
      diseno['xaxis' + s] = { range: [0, maximo * 1.05], gridcolor: t.linea, zeroline: false, tickfont: { color: t.texto2 },
                              title: { text: i >= trimestres.length - columnas ? 'miles de US$' : '', font: { size: 11.5 } } };
      diseno['yaxis' + s] = { type: 'category', tickfont: { color: t.texto2 }, showticklabels: i % columnas === 0 };
      diseno.annotations.push({ text: '<b>T' + q + '</b>', showarrow: false, xref: 'x' + s + ' domain',
                                yref: 'y' + s + ' domain', x: 0, y: 1, xanchor: 'left', yanchor: 'bottom', yshift: 2,
                                font: { size: 13.5, color: t.texto } });
    });
    Plotly.react(div, trazos, diseno, CONFIG);
  },

  6(div, r) {
    const filas = objetos(r);
    const vista = estado.vistas[6];
    const climas = CLIMAS.filter(c => filas.some(f => f.clima === c));
    const metodos = METODOS.filter(m => filas.some(f => f.metodo_envio === m));
    const trimestres = unicos(filas.map(f => f.trimestre)).sort();
    const campo = vista === 'rating' ? 'rating_promedio' : 'tasa_devolucion_pct';
    const facetas = trimestres.map(q => {
      const celda = (y, m) => filas.find(f => f.trimestre === q && f.clima === y && f.metodo_envio === m);
      return {
        titulo: 'T' + q, x: metodos.map(m => es('metodo', m)), y: climas.map(c => es('clima', c)),
        z: matriz(climas, metodos, (y, m) => { const c = celda(y, m); return c ? c[campo] : null; }),
        texto: matriz(climas, metodos, (y, m) => {
          const c = celda(y, m); return c ? (vista === 'rating' ? formato(c[campo], 2) : formato(c[campo], 1) + ' %') : '';
        }),
        detalle: matriz(climas, metodos, (y, m) => {
          const c = celda(y, m); return c ? [c.rating_promedio, c.tasa_devolucion_pct, c.envios] : null;
        }),
      };
    });
    mapasDeCalor(div, facetas, {
      altoFaceta: 280, columnas: Math.min(columnasSegunAncho(div, 4) === 3 ? 2 : columnasSegunAncho(div, 4), facetas.length),
      etiquetasXAbajo: true, anguloX: -25,
      tituloEscala: vista === 'rating' ? 'Rating promedio (1 a 5)' : 'Tasa de devolución (%)',
      hover: '<b>%{y}</b> · %{x}<br>Rating promedio: %{customdata[0]:.2f}<br>' +
             'Tasa de devolución: %{customdata[1]:.1f} %<br>Envíos: %{customdata[2]:,}',
    });
  },

  mes(div, r) {
    const t = tema();
    const filas = objetos(r);
    const vista = estado.vistas.mes;
    const campos = {
      envios: ['envios', 'Envíos', ',.0f', ''], tasa: ['tasa_demora_pct', 'Tasa de demora (%)', '.1f', ' %'],
      dias: ['dias_demora_promedio', 'Días de demora promedio', '.2f', ' días'],
      flete: ['costo_flete_total', 'Costo de flete total (US$)', ',.0f', ''],
      incumplido: ['costo_flete_incumplido', 'Costo de flete incumplido (US$)', ',.0f', ''],
      rating: ['rating_promedio', 'Rating promedio (1 a 5)', '.2f', ''],
      devolucion: ['tasa_devolucion_pct', 'Tasa de devolución (%)', '.1f', ' %'],
    };
    const [campo, titulo, fmt, unidad] = campos[vista];
    Plotly.react(div, [{
      type: 'scatter', mode: 'lines+markers', x: filas.map(f => MESES[f.mes - 1]), y: filas.map(f => f[campo]),
      line: { color: t.series[0], width: 2 }, marker: { size: 8, color: t.series[0], line: { color: t.superficie, width: 2 } },
      fill: 'tozeroy', fillcolor: 'rgba(42, 120, 214, 0.08)', name: titulo, cliponaxis: false,
      hovertemplate: '%{x}: <b>%{y:' + fmt + '}' + unidad + '</b><extra></extra>',
    }], disenoBase(t, {
      height: 300, hovermode: 'x unified', showlegend: false,
      xaxis: { categoryorder: 'array', categoryarray: MESES, showgrid: false, linecolor: t.base, tickfont: { color: t.texto2 } },
      yaxis: { title: { text: titulo }, gridcolor: t.linea, zeroline: false, rangemode: 'tozero', tickfont: { color: t.texto2 } },
      margin: { l: 80, r: 20, t: 16, b: 40 },
    }), CONFIG);
  },
};

// ---------- pintar ----------

function panelVisible(n) {
  const panel = document.getElementById(n === 'mes' ? 'grafico-mes' : 'panel-grafico-' + n);
  return panel && !panel.hidden;
}

function dibujar(n) {
  if (!estado.datos || typeof Plotly === 'undefined') return;
  const resultado = n === 'mes' ? estado.datos.por_mes : estado.datos.preguntas[n];
  const div = document.getElementById('grafico-' + n);
  if (!resultado.filas.length) {
    Plotly.purge(div);
    div.textContent = 'No hay envíos para esta combinación de filtros.';
    div.dataset.vacio = 'si';
    return;
  }
  if (!panelVisible(n)) {
    estado.pendientes.add(n);
    return;
  }
  if (div.dataset.vacio) {
    div.textContent = '';
    delete div.dataset.vacio;
  }
  estado.pendientes.delete(n);
  DIBUJAR[n](div, resultado);
}

function tabla(contenedor, resultado) {
  contenedor.textContent = '';
  const t = document.createElement('table');
  const cabeza = t.createTHead().insertRow();
  const numericas = resultado.columnas.map((_, i) => resultado.filas.length > 0 && resultado.filas.every(f => esNumero(f[i])));
  resultado.columnas.forEach((c, i) => {
    const th = document.createElement('th');
    th.textContent = (COLUMNAS[c] || [c])[0];
    if (numericas[i]) th.className = 'numero-celda';
    cabeza.appendChild(th);
  });
  const cuerpo = t.createTBody();
  resultado.filas.forEach(f => {
    const fila = cuerpo.insertRow();
    f.forEach((v, i) => {
      const td = fila.insertCell();
      td.textContent = textoDeCelda(resultado.columnas[i], v);
      if (numericas[i]) td.className = 'numero-celda';
    });
  });
  contenedor.appendChild(t);
}

function pintarKpis() {
  const k = objetos(estado.datos.totales)[0] || {};
  const contenedor = document.getElementById('kpis');
  contenedor.textContent = '';
  if (!k.envios) return;
  const tarjetas = [
    ['Envíos', formato(k.envios, 0), 'en el período elegido'],
    ['Tasa de demora', formato(k.tasa_demora_pct, 1) + ' %', 'de los envíos llegó tarde'],
    ['Días de demora', formato(k.dias_demora_promedio, 2), 'promedio por envío'],
    ['Flete total', millones(k.costo_flete_total), dolares(k.costo_flete_total) + ' en total'],
    ['Flete incumplido', millones(k.costo_flete_incumplido),
     formato(100 * k.costo_flete_incumplido / k.costo_flete_total, 1) + ' % del flete, en envíos tardíos'],
    ['Rating', formato(k.rating_promedio, 2), 'promedio, de 1 a 5'],
    ['Devolución', formato(k.tasa_devolucion_pct, 1) + ' %', 'de los envíos pidió devolución'],
  ];
  tarjetas.forEach(([nombre, valor, nota]) => {
    const div = document.createElement('div');
    div.className = 'kpi';
    [['p', 'kpi-nombre', nombre], ['p', 'kpi-valor', valor], ['p', 'kpi-nota', nota]].forEach(([tag, clase, texto]) => {
      const e = document.createElement(tag);
      e.className = clase;
      e.textContent = texto;
      div.appendChild(e);
    });
    contenedor.appendChild(div);
  });
}

function pintarTodo() {
  pintarKpis();
  const k = objetos(estado.datos.totales)[0] || {};
  document.getElementById('estado').textContent = k.envios
    ? 'Mostrando ' + formato(k.envios, 0) + ' envíos' + (hayFiltros() ? ' con los filtros elegidos.' : ', todo 2026.')
    : 'No hay envíos para esta combinación de filtros.';
  for (let n = 1; n <= 6; n++) {
    const r = estado.datos.preguntas[n];
    document.getElementById('sql-' + n).textContent = r.sql;
    document.getElementById('cuenta-' + n).textContent = formato(r.filas.length, 0) + ' filas';
    tabla(document.getElementById('tabla-' + n), r);
  }
  if (typeof Plotly === 'undefined') {
    document.getElementById('estado').textContent += ' No se pudo cargar la librería de gráficos: los datos están en la pestaña Tabla.';
    return;
  }
  dibujar('mes');
  for (let n = 1; n <= 6; n++) dibujar(n);
}

// ---------- datos ----------

let pedido = 0;
async function cargarDatos() {
  const numero = ++pedido;
  const contenido = document.getElementById('contenido');
  contenido.setAttribute('aria-busy', 'true');
  history.replaceState(null, '', location.pathname + (hayFiltros() ? '?' + consultaDeFiltros() : '') + location.hash);
  try {
    const respuesta = await fetch('/api/datos?' + consultaDeFiltros());
    if (!respuesta.ok) throw new Error(respuesta.status);
    const datos = await respuesta.json();
    if (numero !== pedido) return;
    estado.datos = datos;
    pintarTodo();
  } catch (error) {
    if (numero !== pedido) return;
    document.getElementById('estado').textContent = 'No se pudo consultar la base. Probá recargar la página en unos segundos.';
  } finally {
    if (numero === pedido) contenido.removeAttribute('aria-busy');
  }
}

let espera = null;
function cambiarFiltros() {
  document.getElementById('limpiar').hidden = !hayFiltros();
  DESPLEGABLES.forEach(([clave, nombre]) => {
    const det = document.getElementById('filtro-' + clave);
    const cantidad = estado.filtros[clave].size;
    det.dataset.activo = cantidad > 0;
    det.querySelector('summary').textContent = cantidad ? nombre + ' · ' + cantidad : nombre;
    det.querySelectorAll('input').forEach(i => { i.checked = estado.filtros[clave].has(i.value); });
  });
  document.querySelectorAll('#filtro-trimestre .chip').forEach(b => {
    b.setAttribute('aria-pressed', estado.filtros.trimestre.has(b.dataset.valor));
  });
  clearTimeout(espera);
  espera = setTimeout(cargarDatos, 250);
}

// ---------- controles ----------

function armarFiltros(opciones) {
  const chips = document.getElementById('filtro-trimestre');
  opciones.trimestre.forEach(o => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.valor = o.valor;
    b.textContent = 'T' + o.etiqueta;
    b.title = ['Enero a marzo', 'Abril a junio', 'Julio a septiembre', 'Octubre a diciembre'][Number(o.valor) - 1] || '';
    b.addEventListener('click', () => {
      const s = estado.filtros.trimestre;
      s.has(o.valor) ? s.delete(o.valor) : s.add(o.valor);
      cambiarFiltros();
    });
    chips.appendChild(b);
  });
  const lugar = document.getElementById('desplegables');
  DESPLEGABLES.forEach(([clave, nombre]) => {
    const det = document.createElement('details');
    det.className = 'desplegable';
    det.id = 'filtro-' + clave;
    const resumen = document.createElement('summary');
    resumen.textContent = nombre;
    det.appendChild(resumen);
    const lista = document.createElement('div');
    lista.className = 'lista-opciones';
    const texto = o => clave === 'deposito' ? o.valor + ' · ' + es('ciudad', o.etiqueta) : es(clave, o.etiqueta);
    const opcionesOrdenadas = opciones[clave].slice();
    if (clave === 'clima') opcionesOrdenadas.sort((a, b) => CLIMAS.indexOf(a.valor) - CLIMAS.indexOf(b.valor));
    if (clave === 'pais') opcionesOrdenadas.sort((a, b) => texto(a).localeCompare(texto(b), 'es'));
    opcionesOrdenadas.forEach(o => {
      const etiqueta = document.createElement('label');
      const casilla = document.createElement('input');
      casilla.type = 'checkbox';
      casilla.value = o.valor;
      casilla.addEventListener('change', () => {
        casilla.checked ? estado.filtros[clave].add(o.valor) : estado.filtros[clave].delete(o.valor);
        cambiarFiltros();
      });
      etiqueta.appendChild(casilla);
      etiqueta.appendChild(document.createTextNode(texto(o)));
      lista.appendChild(etiqueta);
    });
    const acciones = document.createElement('div');
    acciones.className = 'lista-acciones';
    const todos = document.createElement('button');
    todos.type = 'button';
    todos.textContent = 'Todos';
    todos.addEventListener('click', () => { estado.filtros[clave].clear(); cambiarFiltros(); });
    const listo = document.createElement('button');
    listo.type = 'button';
    listo.textContent = 'Listo';
    listo.addEventListener('click', () => { det.open = false; });
    acciones.append(todos, listo);
    lista.appendChild(acciones);
    det.appendChild(lista);
    det.addEventListener('toggle', () => {
      if (det.open) document.querySelectorAll('.desplegable[open]').forEach(d => { if (d !== det) d.open = false; });
    });
    lugar.appendChild(det);
  });
  document.addEventListener('click', e => {
    document.querySelectorAll('.desplegable[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.desplegable[open]').forEach(d => { d.open = false; });
  });
  document.getElementById('limpiar').addEventListener('click', () => {
    CLAVES.forEach(c => estado.filtros[c].clear());
    cambiarFiltros();
  });
}

function armarVistas() {
  Object.entries(VISTAS).forEach(([n, opciones]) => {
    const grupo = document.getElementById('vistas-' + n);
    opciones.forEach(([valor, nombre]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = nombre;
      b.setAttribute('aria-pressed', estado.vistas[n] === valor);
      b.addEventListener('click', () => {
        estado.vistas[n] = valor;
        grupo.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b));
        dibujar(n === 'mes' ? 'mes' : Number(n));
      });
      grupo.appendChild(b);
    });
  });
  for (let n = 1; n <= 6; n++) {
    document.getElementById('titulo-' + n).textContent = TITULOS[n];
  }
}

function armarPestanas() {
  document.querySelectorAll('.pestanas').forEach(lista => {
    const botones = Array.from(lista.querySelectorAll('[role="tab"]'));
    botones.forEach(b => b.addEventListener('click', () => {
      botones.forEach(o => {
        const activo = o === b;
        o.setAttribute('aria-selected', activo);
        document.getElementById(o.getAttribute('aria-controls')).hidden = !activo;
      });
      const n = Number(b.id.split('-').pop());
      if (b.id.startsWith('tab-grafico') && estado.pendientes.has(n)) dibujar(n);
      else if (b.id.startsWith('tab-grafico') && window.Plotly) Plotly.Plots.resize(document.getElementById('grafico-' + n));
    }));
  });
}

let ancho = window.innerWidth;
window.addEventListener('resize', () => {
  if (Math.abs(window.innerWidth - ancho) < 60) return;
  ancho = window.innerWidth;
  clearTimeout(window.redibujo);
  window.redibujo = setTimeout(() => { dibujar('mes'); for (let n = 1; n <= 6; n++) dibujar(n); }, 300);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  dibujar('mes');
  for (let n = 1; n <= 6; n++) dibujar(n);
});

async function iniciar() {
  armarVistas();
  armarPestanas();
  try {
    const opciones = await (await fetch('/api/opciones')).json();
    armarFiltros(opciones);
    CLAVES.forEach(c => {
      const validos = new Set(opciones[c].map(o => o.valor));
      estado.filtros[c].forEach(v => { if (!validos.has(v)) estado.filtros[c].delete(v); });
    });
  } catch (error) {
    document.getElementById('estado').textContent = 'No se pudo consultar la base. Probá recargar la página en unos segundos.';
    return;
  }
  cambiarFiltros();
}

iniciar();
