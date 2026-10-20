'use strict';
/* Axial AV · Almacén (app instalable, versión 2)
 * Lee y escribe directamente en la hoja Inventario_Axial_AV con la API de Google Sheets.
 * Todo se trabaja en el móvil (instantáneo) y los cambios se suben a la hoja en segundo plano. */

const CFG = {
  VERSION: '2.1.0',
  SS_ID: '1sPmmP0mKPehM3T_5UsKKvBpN_fzY7SnxESR6XlC5jDA',
  // API de Apps Script que lee y escribe la hoja con la cuenta de Pol (el móvil no inicia sesión en Google)
  API: 'https://script.google.com/macros/s/AKfycbwH8PzMJ98JMvJAPfm4AAUq2AFFeEi14Cn7N6DH-Iumqgws2WcJ4tWrFeJVK4O2VJkj1g/exec',
  UBIC_ALMACEN: 'Trastero El Prat',
  UBIC_EVENTO: 'En evento',
  UBIC_CLIENTE: 'Con el cliente (alquiler)',
  TIPO_ALQUILER: 'Sin técnico (alquiler)',
};
const RANGOS = {
  eq: ['Equipos', 'A1:W'], gr: ['Cables y granel', 'A1:T'], ev: ['Eventos', 'A1:L'], rs: ['Reservas', 'A1:L'],
  mv: ['Movimientos', 'A1:G'], mt: ['Mantenimiento', 'A1:H'], ls: ['Listas', 'A1:C'],
};
const BLOQUEAN_SALIDA = ['En evento', 'Alquilado', 'Para reparar', 'En reparación', 'Prestado', 'Perdido', 'Retirado'];

// =============== Utilidades ===============
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s == null ? '' : s).trim().toUpperCase();
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'], MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fdate(iso) {
  if (!iso) return '—'; const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso); if (!m) return esc(iso);
  const d = new Date(+m[1], +m[2] - 1, +m[3]); return DIAS[d.getDay()] + ' ' + d.getDate() + ' ' + MESES[d.getMonth()];
}
function store(k, v) {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null');
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { return null; }
}
const p2 = n => String(n).padStart(2, '0');
const EPOCH = Date.UTC(1899, 11, 30);
// Fechas de Sheets (número de serie) <-> texto
function serialISO(v) { if (typeof v !== 'number') return v ? String(v) : ''; return new Date(EPOCH + Math.round(v * 864e5)).toISOString().slice(0, 10); }
function serialDT(v) {
  if (typeof v !== 'number') return String(v || '');
  const d = new Date(EPOCH + Math.round(v * 864e5));
  return p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + String(d.getUTCFullYear()).slice(2) + ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes());
}
function ahoraSerial() { const d = new Date(); return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - EPOCH) / 864e5; }
function serialTexto(v, conHora) {
  const d = new Date(EPOCH + Math.round(v * 864e5));
  let s = p2(d.getUTCDate()) + '/' + p2(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  if (conHora) s += ' ' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds());
  return s;
}
function hoyISO() { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
// Texto que el usuario escribe: que la hoja no lo tome por una fórmula
const txt = s => { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; };
const colLetra = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const hojaA1 = n => "'" + n.replace(/'/g, "''") + "'";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

let toastT;
function toast(msg, kind) { const t = $('#toast'); t.className = kind || 'info'; t.textContent = msg; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', kind === 'err' ? 4500 : 2200); }
let actx;
function beep(kind) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const tones = kind === 'ok' ? [[1320, .1]] : kind === 'warn' ? [[660, .12], [880, .12]] : [[220, .18], [180, .25]];
    let t = actx.currentTime;
    tones.forEach(([f, d]) => { const o = actx.createOscillator(), g = actx.createGain(); o.type = kind === 'err' ? 'square' : 'sine'; o.frequency.value = f; g.gain.value = .12; o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d); t += d + .04; });
  } catch (e) { }
  try { navigator.vibrate && navigator.vibrate(kind === 'ok' ? 60 : kind === 'warn' ? [80, 60, 80] : [180, 80, 180]); } catch (e) { }
}
const errMsg = e => String(e && e.message || e).replace(/^Error:\s*/, '');

// =============== Base de datos local (copia de la hoja) ===============
const DB = { t: null, at: 0 };
function cargarCache() { const c = store('axial-db'); if (c && c.t) { DB.t = c.t; DB.at = c.at; return true; } return false; }
function guardarCache() { store('axial-db', { t: DB.t, at: DB.at }); }
function col(t, nombre) {
  let i = t.head.indexOf(nombre);
  if (i < 0) i = t.head.findIndex(h => h.indexOf(nombre) === 0);
  if (i < 0) throw new Error('Falta la columna «' + nombre + '» en la hoja.');
  return i;
}
const T = k => DB.t[k];

function leerEquipos() {
  const t = T('eq'); const c = {
    id: col(t, 'ID'), modelo: col(t, 'Código de modelo'), cat: col(t, 'Categoría'), desc: col(t, 'Marca y modelo'),
    prop: col(t, 'Propietario'), serie: col(t, 'Nº de serie'), estado: col(t, 'Estado'), cond: col(t, 'Condición'),
    ubic: col(t, 'Ubicación'), cont: col(t, 'Contenedor'), acc: col(t, 'Accesorios'), prox: col(t, 'Próxima revisión'),
    aviso: col(t, 'Aviso de revisión'), salidas: col(t, 'Nº de salidas'), obs: col(t, 'Observaciones'),
  };
  const lista = [];
  t.rows.forEach((r, i) => {
    const id = norm(r[c.id]); if (!id) return;
    lista.push({
      i, id, modelo: String(r[c.modelo] || ''), cat: String(r[c.cat] || ''), desc: String(r[c.desc] || ''), prop: String(r[c.prop] || ''),
      serie: String(r[c.serie] || ''), estado: String(r[c.estado] || ''), cond: String(r[c.cond] || ''), ubic: String(r[c.ubic] || ''),
      cont: String(r[c.cont] || ''), acc: String(r[c.acc] || ''), prox: serialISO(r[c.prox]), aviso: String(r[c.aviso] || ''),
      salidas: Number(r[c.salidas]) || 0, obs: String(r[c.obs] || ''),
    });
  });
  return { t, c, lista };
}
function leerGranel() {
  const t = T('gr'); const c = { code: col(t, 'Código'), desc: col(t, 'Descripción'), sub: col(t, 'Subtipo'), total: col(t, 'Total'), disp: col(t, 'Disponibles'), ev: col(t, 'En evento') };
  return { t, c, lista: t.rows.filter(r => norm(r[c.code])).map(r => ({ code: norm(r[c.code]), desc: String(r[c.desc] || ''), sub: String(r[c.sub] || ''), total: Number(r[c.total]) || 0, disp: Number(r[c.disp]) || 0, fuera: Number(r[c.ev]) || 0, r })) };
}
function leerEventos() {
  const t = T('ev'); const c = {
    id: col(t, 'ID evento'), nombre: col(t, 'Nombre'), cliente: col(t, 'Cliente'), tipo: col(t, 'Tipo'), lugar: col(t, 'Lugar'),
    carga: col(t, 'Fecha de carga'), vuelta: col(t, 'Fecha de vuelta'), estado: col(t, 'Estado'), lineas: col(t, 'Líneas reservadas'),
    conf: col(t, 'Conflictos'), notas: col(t, 'Notas'),
  };
  const lista = [];
  t.rows.forEach((r, i) => {
    const id = norm(r[c.id]); if (!id) return;
    lista.push({ i, id, nombre: String(r[c.nombre] || ''), cliente: String(r[c.cliente] || ''), tipo: String(r[c.tipo] || ''), lugar: String(r[c.lugar] || ''),
      carga: serialISO(r[c.carga]), vuelta: serialISO(r[c.vuelta]), estado: String(r[c.estado] || ''), lineas: Number(r[c.lineas]) || 0,
      conflictos: Number(r[c.conf]) || 0, notas: String(r[c.notas] || '') });
  });
  return { t, c, lista };
}
function leerFuera(ids) {
  const t = T('mv'); const cT = col(t, 'Tipo'), cI = col(t, 'ID'), cQ = col(t, 'Cantidad'), cE = col(t, 'Evento');
  const esEq = new Set(ids), ultimo = {}, granel = {};
  t.rows.forEach(r => {
    const tipo = String(r[cT] || ''), id = norm(r[cI]), ev = norm(r[cE]);
    if (!id || (tipo !== 'Salida' && tipo !== 'Entrada')) return;
    if (esEq.has(id)) ultimo[id] = { tipo, evento: ev };
    else if (ev) { const q = Number(r[cQ]) || 0; granel[ev] = granel[ev] || {}; granel[ev][id] = (granel[ev][id] || 0) + (tipo === 'Salida' ? q : -q); }
  });
  const equipos = {};
  Object.keys(ultimo).forEach(id => { const u = ultimo[id]; if (u.tipo === 'Salida' && u.evento) (equipos[u.evento] = equipos[u.evento] || []).push(id); });
  Object.keys(granel).forEach(ev => Object.keys(granel[ev]).forEach(k => { if (granel[ev][k] <= 0) delete granel[ev][k]; }));
  return { equipos, granel, ultimo };
}
function leerReservas(evId) {
  const t = T('rs'); const c = { ev: col(t, 'ID evento'), mat: col(t, 'Material'), cant: col(t, 'Cantidad'), code: col(t, 'Código'), tipo: col(t, 'Tipo'), res: col(t, 'Resultado') };
  return t.rows.filter(r => norm(r[c.ev]) === evId && (r[c.mat] || r[c.cant])).map(r => ({
    material: String(r[c.mat] || ''), cantidad: Number(r[c.cant]) || 0, codigo: norm(r[c.code]), tipo: String(r[c.tipo] || ''), resultado: String(r[c.res] || '') }));
}
function ubicaciones() { const t = T('ls'); const c = col(t, 'Ubicación'); return t.rows.map(r => String(r[c] || '').trim()).filter(Boolean); }
function persona() { return QUIEN || 'Pol'; }

// Vista calculada de todo (equivale a getDatos de la v1)
function calcDatos() {
  const eq = leerEquipos(), fuera = leerFuera(eq.lista.map(e => e.id)), evs = leerEventos().lista;
  const evPorId = {}; evs.forEach(e => evPorId[e.id] = e);
  eq.lista.forEach(e => { const u = fuera.ultimo[e.id]; e.eventoFuera = (u && u.tipo === 'Salida') ? u.evento : ''; e.eventoNombre = e.eventoFuera && evPorId[e.eventoFuera] ? evPorId[e.eventoFuera].nombre : ''; });
  evs.forEach(e => { const g = fuera.granel[e.id] || {}; e.fueraEquipos = (fuera.equipos[e.id] || []).length; e.fueraGranel = Object.values(g).reduce((s, v) => s + v, 0); });
  return { persona: persona(), equipos: eq.lista, granel: leerGranel().lista, eventos: evs, ubicaciones: ubicaciones(), hoy: hoyISO(), fuera };
}
function calcEvento(evId) {
  evId = norm(evId); const ev = S.d.eventos.find(e => e.id === evId);
  if (!ev) throw new Error('El evento ' + evId + ' no existe.');
  return { evento: ev, lineas: leerReservas(evId), fueraEquipos: S.d.fuera.equipos[evId] || [], fueraGranel: S.d.fuera.granel[evId] || {} };
}
function calcFicha(id) {
  id = norm(id); const e = S.d.equipos.find(x => x.id === id);
  if (!e) throw new Error('No existe ningún equipo con el ID ' + id + '.');
  const m = T('mv'), mF = col(m, 'Fecha'), mT = col(m, 'Tipo'), mI = col(m, 'ID'), mE = col(m, 'Evento'), mN = col(m, 'Notas');
  const movs = m.rows.filter(r => norm(r[mI]) === id).slice(-8).reverse().map(r => ({ fecha: serialDT(r[mF]), tipo: String(r[mT]), evento: String(r[mE] || ''), notas: String(r[mN] || '') }));
  const t = T('mt'), tF = col(t, 'Fecha'), tI = col(t, 'ID'), tT = col(t, 'Tipo'), tD = col(t, 'Descripción'), tR = col(t, 'Resultado');
  const mant = t.rows.filter(r => norm(r[tI]) === id).reverse().map(r => ({ fecha: serialISO(r[tF]), tipo: String(r[tT]), desc: String(r[tD] || ''), resultado: String(r[tR] || '') }));
  return { equipo: e, movimientos: movs, mantenimiento: mant };
}

// =============== Cola de cambios pendientes de subir ===============
const cola = v => v === undefined ? (store('axial-cola') || []) : store('axial-cola', v);
function encolar(ops) { cola(cola().concat(ops)); guardarCache(); setTimeout(sync, 0); pintarSync(); }
// Helpers que cambian la copia local y preparan la operación para la hoja
function setLocal(k, fila, colIdx, val) { const r = T(k).rows[fila]; while (r.length <= colIdx) r.push(''); r[colIdx] = val; }
function opSet(hoja, clave, columna, val) { return { hoja, clave, columna, val }; }
function opAppend(hoja, filasLocal) {
  // Se envían tal como quedan en la copia local (fecha = número de serie); el servidor las convierte
  return { k: 'app', id: uid(), hoja, filas: filasLocal.map(r => r.slice()) };
}

// =============== Acciones (validan, cambian lo local y encolan) ===============
function registrarSalida(p) {
  const quien = persona(), evId = norm(p.evento);
  const evs = leerEventos(), ev = evs.lista.find(e => e.id === evId);
  if (!ev) throw new Error('El evento ' + evId + ' no existe.');
  if (ev.estado !== 'Confirmado' && ev.estado !== 'En curso') throw new Error('El evento está en «' + ev.estado + '». Solo sale material de eventos Confirmados o En curso.');
  const eq = leerEquipos(), porId = {}; eq.lista.forEach(e => porId[e.id] = e);
  const ids = (p.equipos || []).map(norm).filter(Boolean), errores = [];
  ids.forEach(id => { const e = porId[id]; if (!e) errores.push(id + ': no existe'); else if (BLOQUEAN_SALIDA.includes(e.estado)) errores.push(id + ': está «' + e.estado + '»'); else if (e.cond === 'Averiado') errores.push(id + ': está averiado'); });
  if (errores.length) throw new Error('No he guardado nada. Revisa:\n' + errores.join('\n'));
  const alq = ev.tipo === CFG.TIPO_ALQUILER, nEstado = alq ? 'Alquilado' : 'En evento', nUbic = alq ? CFG.UBIC_CLIENTE : CFG.UBIC_EVENTO;
  const ahora = ahoraSerial(), nota = String(p.nota || ''), filas = [], sets = [];
  ids.forEach(id => {
    const e = porId[id];
    setLocal('eq', e.i, eq.c.estado, nEstado); setLocal('eq', e.i, eq.c.ubic, nUbic); setLocal('eq', e.i, eq.c.salidas, e.salidas + 1);
    sets.push(opSet('Equipos', id, 'Estado', nEstado), opSet('Equipos', id, 'Ubicación', nUbic));
    filas.push([ahora, 'Salida', id, 1, evId, quien, nota]);
  });
  const gr = leerGranel(); let uGr = 0;
  (p.granel || []).forEach(g => {
    const q = Math.round(Number(g.qty) || 0), code = norm(g.code); if (q <= 0) return;
    filas.push([ahora, 'Salida', code, q, evId, quien, nota]); uGr += q;
    const x = gr.lista.find(y => y.code === code); if (x) { x.r[gr.c.disp] = x.disp - q; x.r[gr.c.ev] = x.fuera + q; }
  });
  if (!filas.length) throw new Error('No hay nada que registrar.');
  let estadoEv = ev.estado;
  if (ev.estado === 'Confirmado') { setLocal('ev', ev.i, evs.c.estado, 'En curso'); sets.push(opSet('Eventos', evId, 'Estado', 'En curso')); estadoEv = 'En curso'; }
  T('mv').rows.push(...filas.map(r => r.slice()));
  encolar([opAppend('Movimientos', filas, true), { k: 'sets', id: uid(), sets }]);
  return { equipos: ids.length, granel: uGr, estadoEvento: estadoEv };
}

function registrarEntrada(p) {
  const quien = persona(), evId = norm(p.evento);
  const evs = leerEventos(), ev = evs.lista.find(e => e.id === evId);
  if (!ev) throw new Error('El evento ' + evId + ' no existe.');
  const eq = leerEquipos(), porId = {}; eq.lista.forEach(e => porId[e.id] = e);
  const fuera = leerFuera(eq.lista.map(e => e.id)), fueraEv = fuera.equipos[evId] || [], granelEv = fuera.granel[evId] || {};
  const items = (p.equipos || []).map(x => ({ id: norm(x.id), cond: x.cond || 'OK', nota: String(x.nota || '').trim() })).filter(x => x.id);
  const errores = [];
  items.forEach(x => { if (!fueraEv.includes(x.id)) errores.push(x.id + ': no consta fuera en este evento'); });
  (p.granel || []).forEach(g => { const q = Number(g.qty) || 0, code = norm(g.code); if (q > (granelEv[code] || 0)) errores.push(code + ': vuelven ' + q + ' pero salieron ' + (granelEv[code] || 0)); });
  if (errores.length) throw new Error('No he guardado nada. Revisa:\n' + errores.join('\n'));
  const ubic = p.ubic || CFG.UBIC_ALMACEN, ahora = ahoraSerial(), hoy = Math.floor(ahora), filas = [], mant = [], sets = [];
  items.forEach(x => {
    const e = porId[x.id];
    const estado = x.cond === 'Con incidencia' ? 'Por revisar' : x.cond === 'Averiado' ? 'Para reparar' : 'Disponible';
    setLocal('eq', e.i, eq.c.estado, estado); setLocal('eq', e.i, eq.c.ubic, ubic);
    sets.push(opSet('Equipos', x.id, 'Estado', estado), opSet('Equipos', x.id, 'Ubicación', ubic));
    if (x.cond !== 'OK') {
      setLocal('eq', e.i, eq.c.cond, x.cond); sets.push(opSet('Equipos', x.id, 'Condición', x.cond));
      mant.push([hoy, x.id, 'Avería', (x.nota || 'Incidencia sin describir') + ' (vuelta de ' + evId + ')', 'Pendiente', '', quien, '']);
    }
    filas.push([ahora, 'Entrada', x.id, 1, evId, quien, x.nota]);
  });
  const gr = leerGranel();
  (p.granel || []).forEach(g => {
    const q = Math.round(Number(g.qty) || 0), code = norm(g.code); if (q <= 0) return;
    filas.push([ahora, 'Entrada', code, q, evId, quien, '']);
    const x = gr.lista.find(y => y.code === code); if (x) { x.r[gr.c.disp] = x.disp + q; x.r[gr.c.ev] = Math.max(0, x.fuera - q); }
  });
  if (!filas.length) throw new Error('No hay nada que registrar.');
  const vuelven = new Set(items.map(x => x.id)), quedanEq = fueraEv.filter(id => !vuelven.has(id));
  const resto = Object.assign({}, granelEv); (p.granel || []).forEach(g => { resto[norm(g.code)] -= Number(g.qty) || 0; });
  const quedanGr = Object.keys(resto).filter(k => resto[k] > 0);
  let cerrado = false;
  if (p.cerrar && !quedanEq.length && !quedanGr.length) { setLocal('ev', ev.i, evs.c.estado, 'Cerrado'); sets.push(opSet('Eventos', evId, 'Estado', 'Cerrado')); cerrado = true; }
  T('mv').rows.push(...filas.map(r => r.slice()));
  const ops = [opAppend('Movimientos', filas, true)];
  if (mant.length) { T('mt').rows.push(...mant.map(r => r.slice())); ops.push(opAppend('Mantenimiento', mant, false)); }
  ops.push({ k: 'sets', id: uid(), sets });
  encolar(ops);
  return { equipos: items.length, incidencias: mant.length, quedanEquipos: quedanEq, quedanGranel: quedanGr, cerrado };
}

function reportarIncidencia(p) {
  const quien = persona(), id = norm(p.id), desc = String(p.desc || '').trim();
  if (!desc) throw new Error('Describe la incidencia.');
  if (p.cond !== 'Con incidencia' && p.cond !== 'Averiado') throw new Error('Elige «Con incidencia» o «Averiado».');
  const eq = leerEquipos(), e = eq.lista.find(x => x.id === id);
  if (!e) throw new Error('No existe ningún equipo con el ID ' + id + '.');
  const sets = [opSet('Equipos', id, 'Condición', p.cond)]; setLocal('eq', e.i, eq.c.cond, p.cond);
  let estado = e.estado;
  if (p.cond === 'Averiado' && (e.estado === 'Disponible' || e.estado === 'Por revisar')) estado = 'Para reparar';
  if (estado !== e.estado) { setLocal('eq', e.i, eq.c.estado, estado); sets.push(opSet('Equipos', id, 'Estado', estado)); }
  const ahora = ahoraSerial();
  const mt = [[Math.floor(ahora), id, 'Avería', desc, 'Pendiente', '', quien, '']], mv = [[ahora, 'Incidencia', id, 1, '', quien, p.cond + ': ' + desc]];
  T('mt').rows.push(mt[0].slice()); T('mv').rows.push(mv[0].slice());
  encolar([{ k: 'sets', id: uid(), sets }, opAppend('Mantenimiento', mt, false), opAppend('Movimientos', mv, true)]);
  return { estado, cond: p.cond };
}

function marcarRevisado(p) {
  const quien = persona(), id = norm(p.id);
  const eq = leerEquipos(), e = eq.lista.find(x => x.id === id);
  if (!e) throw new Error('No existe ningún equipo con el ID ' + id + '.');
  const sets = [opSet('Equipos', id, 'Condición', 'OK')]; setLocal('eq', e.i, eq.c.cond, 'OK');
  let estado = e.estado;
  if (['Por revisar', 'Para reparar', 'En reparación'].includes(e.estado)) estado = 'Disponible';
  if (estado !== e.estado) { setLocal('eq', e.i, eq.c.estado, estado); sets.push(opSet('Equipos', id, 'Estado', estado)); }
  const t = T('mt'), tI = col(t, 'ID'), tR = col(t, 'Resultado');
  t.rows.forEach(r => { if (norm(r[tI]) === id && String(r[tR]) === 'Pendiente') r[tR] = 'Apto'; });
  const mt = [[Math.floor(ahoraSerial()), id, 'Revisión', String(p.nota || '').trim() || 'Revisado desde la app: funciona bien', 'Apto', '', quien, '']];
  t.rows.push(mt[0].slice());
  encolar([{ k: 'sets', id: uid(), sets }, { k: 'mantApto', id: uid(), equipo: id }, opAppend('Mantenimiento', mt, false)]);
  return { estado };
}

// =============== Conexión con la hoja (API de Apps Script) ===============
// El código de acceso se guarda en el móvil. Se puede poner con un enlace ...#k=CODIGO o escribiéndolo al entrar.
let CLAVE = store('axial-clave') || '';
let QUIEN = store('axial-quien') || '';
(function claveDelEnlace() {
  const m = /[#&]k=([^&]+)/.exec(location.hash || '');
  if (m) { CLAVE = decodeURIComponent(m[1]).trim(); store('axial-clave', CLAVE); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { } }
})();
function ponerClave(c) { CLAVE = String(c || '').trim(); store('axial-clave', CLAVE || null); }
async function api(cuerpo) {
  if (!CLAVE) { const e = new Error('Falta el código de acceso.'); e.auth = true; throw e; }
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 60000);
  let r;
  try {
    r = await fetch(CFG.API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ clave: CLAVE }, cuerpo)), signal: ctrl.signal, redirect: 'follow' });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'La hoja tarda demasiado en responder.' : 'Sin conexión con la hoja.'); }
  finally { clearTimeout(t); }
  if (!r.ok) throw new Error('Error ' + r.status + ' del servidor.');
  let j; try { j = await r.json(); } catch (e) { throw new Error('Respuesta rara del servidor.'); }
  if (!j.ok) { const e = new Error(j.error || 'Error del servidor.'); e.auth = !!j.auth; throw e; }
  if (j.quien && j.quien !== QUIEN) { QUIEN = j.quien; store('axial-quien', QUIEN); }
  return j;
}
function guardarDatos(datos) { DB.t = datos; DB.at = Date.now(); guardarCache(); }
async function descargar() {
  const j = await api({ ops: [], descargar: true });
  if (cola().length) return false;   // hay cambios locales sin subir: no los piso
  guardarDatos(j.datos); return true;
}

// Sincronización: sube la cola y baja la hoja actualizada en una sola llamada
const SYNC = { on: false, err: '', auth: false, t: null };
async function sync() {
  if (SYNC.on) return;
  clearTimeout(SYNC.t);
  if (!navigator.onLine) { pintarSync(); return; }
  if (!CLAVE) { SYNC.auth = true; pintarSync(); return; }
  SYNC.on = true; SYNC.err = ''; pintarSync();
  try {
    const ops = cola();
    const j = await api({ ops, descargar: true });
    const hechas = new Set(j.hechas || []);
    const resto = cola().filter(op => !hechas.has(op.id));
    cola(resto); SYNC.auth = false;
    if (!resto.length && j.datos) { guardarDatos(j.datos); refrescarVista(); }
  } catch (e) {
    if (e.auth) SYNC.auth = true; else { SYNC.err = errMsg(e); SYNC.t = setTimeout(sync, 20000); }
  } finally {
    SYNC.on = false; pintarSync();
    if (cola().length && !SYNC.err && !SYNC.auth && navigator.onLine) setTimeout(sync, 300);
  }
}
function pintarSync() {
  const b = $('#btnSync'); if (!b) return;
  const n = cola().length; let cls = 'ok', tx = '✓';
  if (SYNC.on) { cls = 'run'; tx = '⟳' + (n ? ' ' + n : ''); }
  else if (!navigator.onLine) { cls = 'off'; tx = n ? '✈ ' + n : '✈'; }
  else if (SYNC.auth) { cls = 'err'; tx = n ? '⚠ ' + n : '⚠'; }
  else if (SYNC.err) { cls = 'err'; tx = '! ' + n; }
  else if (n) { cls = 'run'; tx = '⟳ ' + n; }
  b.className = 'ib sync ' + cls; b.textContent = tx;
  const ban = $('#banner');
  if (SYNC.auth && DB.t) { ban.style.display = 'flex'; ban.innerHTML = '<span>' + (n ? n + ' cambio' + (n > 1 ? 's' : '') + ' sin subir. ' : '') + 'El código de acceso no es válido.</span><button class="btn pri" onclick="cambiarClave()">Cambiar</button>'; }
  else ban.style.display = 'none';
}
async function cambiarClave() {
  const r = await modal('Código de acceso', '<p class="small mut">Es el código que te da Pol para conectar la app con la hoja.</p><input type="text" name="clave" autocomplete="off" autocapitalize="none" spellcheck="false" value="' + esc(CLAVE) + '">', [{ label: 'Guardar', cls: 'pri', value: true }, { label: 'Cancelar', value: false }]);
  if (!r.value) return;
  ponerClave(r.fields.clave); SYNC.auth = false; pintarSync(); await sync();
  toast(SYNC.auth ? 'Ese código no funciona' : 'Conectado con la hoja', SYNC.auth ? 'err' : 'ok');
}
async function tocarSync() {
  const n = cola().length;
  if (SYNC.auth || !CLAVE) return cambiarClave();
  if (!navigator.onLine) return modal('Sin conexión', '<p>' + (n ? 'Tienes <b>' + n + '</b> cambio' + (n > 1 ? 's' : '') + ' guardados en el móvil. Se subirán solos a la hoja cuando vuelva la cobertura.' : 'Todo está subido. Cuando vuelva la cobertura se actualizarán los datos.') + '</p>', [{ label: 'Entendido', value: 1 }]);
  const hace = DB.at ? Math.round((Date.now() - DB.at) / 60000) : null;
  const r = await modal('Sincronización', '<p>' + (n ? '<b>' + n + '</b> cambio' + (n > 1 ? 's' : '') + ' pendientes de subir.' : 'Todo está subido a la hoja.') + '</p>' + (SYNC.err ? '<p class="small" style="color:var(--err)">Último error: ' + esc(SYNC.err) + '</p>' : '') +
    '<p class="small mut">Datos de la hoja de hace ' + (hace === null ? '—' : hace < 1 ? 'menos de 1 min' : hace + ' min') + '. Conectado como ' + esc(persona()) + '. Versión ' + CFG.VERSION + '.</p>',
    [{ label: 'Actualizar ahora', cls: 'pri', value: 'sync' }, { label: 'Cambiar código de acceso', value: 'clave' }, { label: 'Cerrar', value: '' }]);
  if (r.value === 'clave') return cambiarClave();
  if (r.value === 'sync') { await sync(); toast(cola().length ? 'Quedan cambios por subir' : SYNC.err ? 'No se ha podido actualizar' : 'Datos actualizados', cola().length || SYNC.err ? 'warn' : 'ok'); }
}
window.addEventListener('online', () => sync());
window.addEventListener('offline', pintarSync);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && (cola().length || Date.now() - DB.at > 120000)) sync(); });
