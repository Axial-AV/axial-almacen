'use strict';
/* Pantallas de la app. Todo es local: no hay esperas al pulsar. */

// =============== Ventana modal ===============
function modal(title, html, buttons) {
  return new Promise(res => {
    const box = $('#modalBox');
    box.innerHTML = '<h2>' + esc(title) + '</h2><div>' + (html || '') + '</div><div class="btns">' +
      buttons.map((b, i) => '<button class="btn ' + (b.cls || '') + '" data-i="' + i + '">' + esc(b.label) + '</button>').join('') + '</div>';
    $('#modal').style.display = 'flex'; SCAN.busy = true;
    box.querySelectorAll('.btns button').forEach(btn => btn.onclick = () => {
      const fields = {};
      box.querySelectorAll('[name]').forEach(el => { if (el.type === 'radio') { if (el.checked) fields[el.name] = el.value; } else if (el.type === 'checkbox') fields[el.name] = el.checked; else fields[el.name] = el.value; });
      $('#modal').style.display = 'none'; SCAN.busy = false;
      res({ value: buttons[+btn.dataset.i].value, fields });
    });
  });
}
function pillEstado(e) { const m = { 'Disponible': 'p-ok', 'En evento': 'p-blue', 'Alquilado': 'p-blue', 'Por revisar': 'p-warn', 'Para reparar': 'p-err', 'En reparación': 'p-err', 'Prestado': 'p-pur', 'Perdido': 'p-dim', 'Retirado': 'p-dim' }; return '<span class="pill ' + (m[e] || '') + '">' + esc(e || '—') + '</span>'; }
function pillCond(c) { const m = { 'OK': 'p-ok', 'Con incidencia': 'p-warn', 'Averiado': 'p-err' }; return '<span class="pill ' + (m[c] || '') + '">' + esc(c || '—') + '</span>'; }
function pillEv(e) { const m = { 'Presupuesto': '', 'Confirmado': 'p-ok', 'En curso': 'p-blue', 'Cerrado': 'p-dim', 'Cancelado': 'p-dim' }; return '<span class="pill ' + (m[e] || '') + '">' + esc(e || '—') + '</span>'; }
function pillRes(r) { if (!r) return ''; let c = 'p-ok'; if (/^Aviso/.test(r)) c = 'p-warn'; else if (r !== 'OK') c = 'p-err'; return '<span class="pill ' + c + '">' + esc(r) + '</span>'; }

// =============== Escáner ===============
const SCAN = { qr: null, on: false, starting: false, handler: null, busy: false, last: '', lastT: 0 };
function scanInit() {
  if (SCAN.qr || !window.Html5Qrcode) return;
  try { SCAN.qr = new Html5Qrcode('reader', { verbose: false, formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], experimentalFeatures: { useBarCodeDetectorIfSupported: true } }); }
  catch (e) { SCAN.qr = null; }
}
function onCode(raw) {
  const code = norm(raw);
  if (!code || SCAN.busy || !SCAN.handler) return;
  const now = Date.now();
  if (code === SCAN.last && now - SCAN.lastT < 2500) return;
  SCAN.last = code; SCAN.lastT = now;
  SCAN.handler(code);
}
async function camStart() {
  scanInit();
  if (!SCAN.qr) { toast('No he podido cargar el lector de QR. Escribe el ID a mano.', 'warn'); return; }
  if (SCAN.on || SCAN.starting) return;
  SCAN.starting = true;
  try {
    await SCAN.qr.start({ facingMode: 'environment' }, { fps: 12, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * .72); return { width: s, height: s }; }, aspectRatio: 1.6 }, onCode, () => { });
    SCAN.on = true; $('#btnCam').classList.add('act');
    if (!SCAN.handler) camStop();
  } catch (e) { SCAN.on = false; toast('No puedo abrir la cámara: ' + errMsg(e) + '. Usa la foto o escribe el ID.', 'warn'); }
  finally { SCAN.starting = false; }
}
async function camStop() {
  if (SCAN.qr && SCAN.on) { try { await SCAN.qr.stop(); } catch (e) { } }
  SCAN.on = false; $('#btnCam').classList.remove('act');
}
function scanShow(handler, placeholder) {
  SCAN.handler = handler; $('#scanPanel').style.display = 'block'; $('#manual').placeholder = placeholder || 'ID a mano';
  if (store('axial-cam') !== false) camStart();
}
function scanHide() { SCAN.handler = null; $('#manual').oninput = null; $('#manual').value = ''; $('#scanPanel').style.display = 'none'; camStop(); }
function flash(el, color) { if (!el) return; el.style.setProperty('--c', color); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

// =============== Estado y navegación ===============
const S = { d: null, eq: {}, gr: {}, ev: {}, cur: null, view: 'home', args: [] };
function rebuild() {
  const d = calcDatos(); S.d = d; S.eq = {}; S.gr = {}; S.ev = {};
  d.equipos.forEach(e => S.eq[e.id] = e); d.granel.forEach(g => S.gr[g.code] = g); d.eventos.forEach(e => S.ev[e.id] = e);
  $('#sub').textContent = 'Almacén · ' + d.persona;
}
function refrescarVista() {
  rebuild();
  if (['home', 'eventos', 'salidaSel', 'entradaSel', 'evento', 'lista'].includes(S.view) && $('#modal').style.display !== 'flex') go(S.view, ...S.args);
}
function bar(html) { $('#barWrap').innerHTML = html ? '<div class="bar"><div class="in">' + html + '</div></div>' : ''; }
function go(view, ...args) { S.view = view; S.args = args; window.scrollTo(0, 0); bar(''); scanHide(); $('#head').innerHTML = ''; VIEWS[view](...args); }
const VIEWS = {};

// =============== Entrar ===============
VIEWS.login = () => {
  $('#head').innerHTML = '';
  $('#view').innerHTML = '<div class="card" style="margin-top:30px;text-align:center;padding:26px 18px"><div class="logo" style="font-size:26px"><b>AXIAL</b> AV</div><p class="mut">App de almacén</p>' +
    '<p>Entra con la cuenta de Google que tiene acceso a la hoja del inventario.</p><button class="btn pri full" onclick="entrar()">Entrar con Google</button>' +
    '<p class="small mut" style="margin-top:14px">La primera vez Google te avisará de que la app no está verificada: es normal, es tuya.</p></div>';
};
async function entrar() {
  try {
    await pedirToken();
    $('#view').innerHTML = '<div class="empty">Descargando el inventario…</div>';
    await descargar(); rebuild(); go('home'); toast('Listo', 'ok'); pintarSync();
  } catch (e) { toast(errMsg(e), 'err'); }
}

// =============== Inicio ===============
VIEWS.home = () => {
  const d = S.d, hoy = d.hoy;
  const salidas = d.eventos.filter(e => e.estado === 'Confirmado' || e.estado === 'En curso');
  const proxima = salidas.filter(e => e.estado === 'Confirmado').sort((a, b) => (a.carga || '9').localeCompare(b.carga || '9'))[0];
  const conFuera = d.eventos.filter(e => e.fueraEquipos + e.fueraGranel > 0);
  const atrasados = d.eventos.filter(e => e.estado === 'En curso' && e.vuelta && e.vuelta < hoy);
  const revisar = d.equipos.filter(e => e.estado === 'Por revisar').length;
  const reparar = d.equipos.filter(e => e.estado === 'Para reparar' || e.estado === 'En reparación').length;
  const fueraTot = conFuera.reduce((s, e) => s + e.fueraEquipos, 0);
  let h = '<div class="grid">' +
    '<button class="big pri" onclick="go(\'salidaSel\')"><span class="ico">⬆</span><span><div class="t">Salida</div><div class="s">' + (proxima ? 'Próxima: ' + esc(proxima.nombre || proxima.id) + ' · ' + fdate(proxima.carga) : salidas.length ? salidas.length + ' eventos activos' : 'Ningún evento confirmado') + '</div></span></button>' +
    '<button class="big" onclick="go(\'entradaSel\')"><span class="ico">⬇</span><span><div class="t">Entrada</div><div class="s">' + (conFuera.length ? fueraTot + ' equipo' + (fueraTot === 1 ? '' : 's') + ' fuera en ' + conFuera.length + ' evento' + (conFuera.length > 1 ? 's' : '') : 'Nada fuera') + '</div></span></button>' +
    '<button class="big" onclick="go(\'consulta\')"><span class="ico">🔍</span><span><div class="t">Consultar</div><div class="s">Ficha, historial e incidencias</div></span></button>' +
    '<button class="big" onclick="go(\'eventos\')"><span class="ico">📅</span><span><div class="t">Eventos</div><div class="s">' + d.eventos.filter(e => e.estado !== 'Cerrado' && e.estado !== 'Cancelado').length + ' abiertos</div></span></button>' +
    '</div>';
  const av = [];
  atrasados.forEach(e => av.push('<div class="card tap hl" style="border-left-color:var(--err)" onclick="go(\'evento\',\'' + esc(e.id) + '\')"><b>Vuelta atrasada:</b> ' + esc(e.nombre || e.id) + ' <span class="mut">(tenía que volver el ' + fdate(e.vuelta) + ')</span></div>'));
  if (revisar) av.push('<div class="card tap hl" onclick="go(\'lista\',\'Por revisar\')"><b>' + revisar + '</b> equipo' + (revisar > 1 ? 's' : '') + ' por revisar</div>');
  if (reparar) av.push('<div class="card tap hl" style="border-left-color:var(--err)" onclick="go(\'lista\',\'reparar\')"><b>' + reparar + '</b> equipo' + (reparar > 1 ? 's' : '') + ' para reparar o en reparación</div>');
  if (av.length) h += '<h3>Avisos</h3>' + av.join('');
  $('#view').innerHTML = h;
};
VIEWS.lista = filtro => {
  const l = S.d.equipos.filter(e => filtro === 'reparar' ? (e.estado === 'Para reparar' || e.estado === 'En reparación') : e.estado === filtro);
  $('#head').innerHTML = '<h2>' + (filtro === 'reparar' ? 'Para reparar' : esc(filtro)) + '</h2>';
  $('#view').innerHTML = l.length ? l.map(e => '<div class="card tap" onclick="verFicha(\'' + esc(e.id) + '\')"><div class="row"><div class="grow"><b>' + esc(e.id) + '</b><div class="small mut">' + esc(e.desc) + '</div></div>' + pillCond(e.cond) + '</div></div>').join('') : '<div class="empty">Nada por aquí.</div>';
};

// =============== Elegir evento ===============
function evCard(e, extra, onclick) {
  return '<div class="card tap" onclick="' + onclick + '"><div class="row"><div class="grow"><b>' + esc(e.nombre || '(sin nombre)') + '</b><div class="small mut">' + esc(e.id) + (e.cliente ? ' · ' + esc(e.cliente) : '') + '</div></div>' + pillEv(e.estado) + '</div>' +
    '<div class="small" style="margin-top:6px">' + fdate(e.carga) + ' → ' + fdate(e.vuelta) + (e.lugar ? ' · ' + esc(e.lugar) : '') + '</div>' + (extra || '') + '</div>';
}
VIEWS.salidaSel = () => {
  const l = S.d.eventos.filter(e => e.estado === 'Confirmado' || e.estado === 'En curso').sort((a, b) => (a.carga || '9').localeCompare(b.carga || '9'));
  $('#head').innerHTML = '<h2>Salida · elige el evento</h2><div class="small mut">Solo salen los eventos Confirmados o En curso. Los presupuestos, primero se confirman en la hoja.</div>';
  $('#view').innerHTML = l.length ? l.map(e => evCard(e, '<div class="small mut" style="margin-top:4px">' + e.lineas + ' líneas reservadas' + (e.conflictos ? ' · <span style="color:var(--err)">' + e.conflictos + ' con problemas</span>' : '') + (e.fueraEquipos ? ' · ' + e.fueraEquipos + ' equipos ya fuera' : '') + '</div>', "abrirSalida('" + esc(e.id) + "')")).join('') : '<div class="empty">No hay eventos confirmados.<br>Confirma el evento en la hoja (Estado = Confirmado) y pulsa la nube de arriba para actualizar.</div>';
};
VIEWS.entradaSel = () => {
  const l = S.d.eventos.filter(e => e.fueraEquipos + e.fueraGranel > 0).sort((a, b) => (a.vuelta || '9').localeCompare(b.vuelta || '9'));
  $('#head').innerHTML = '<h2>Entrada · elige el evento</h2>';
  $('#view').innerHTML = l.length ? l.map(e => evCard(e, '<div class="small" style="margin-top:4px">Fuera: <b>' + e.fueraEquipos + '</b> equipos' + (e.fueraGranel ? ' y <b>' + e.fueraGranel + '</b> de granel' : '') + (e.vuelta && e.vuelta < S.d.hoy ? ' · <span style="color:var(--err)">vuelta atrasada</span>' : '') + '</div>', "abrirEntrada('" + esc(e.id) + "')")).join('') : '<div class="empty">No hay material fuera.</div>';
};

// =============== SALIDA ===============
function abrirSalida(evId) { try { prepararSalida(calcEvento(evId)); } catch (e) { toast(errMsg(e), 'err'); } }
function agrupar(lineas, tipo) {
  const m = {};
  lineas.filter(l => l.tipo === tipo && l.codigo).forEach(l => { if (!m[l.codigo]) m[l.codigo] = { codigo: l.codigo, material: l.material, cantidad: 0, resultado: [] }; m[l.codigo].cantidad += l.cantidad; if (l.resultado && l.resultado !== 'OK') m[l.codigo].resultado.push(l.resultado); });
  return Object.values(m);
}
function prepararSalida(r) {
  bar(''); scanHide();
  const c = { mode: 'salida', ev: r.evento, lineas: r.lineas, fueraEq: r.fueraEquipos, fueraGr: r.fueraGranel, eq: agrupar(r.lineas, 'Equipo'), gr: agrupar(r.lineas, 'Granel'), scanned: [], granel: {}, extraGr: [], nota: '' };
  c.gr.forEach(g => c.granel[g.codigo] = Math.max(0, g.cantidad - (c.fueraGr[g.codigo] || 0)));
  const draft = store('axial-salida-' + c.ev.id);
  if (draft && ((draft.scanned || []).length || (draft.extraGr || []).length)) { c.scanned = draft.scanned.filter(id => S.eq[id] && !c.fueraEq.includes(id)); Object.assign(c.granel, draft.granel || {}); c.extraGr = draft.extraGr || []; c.nota = draft.nota || ''; setTimeout(() => toast('He recuperado lo que llevabas escaneado', 'info'), 300); }
  S.cur = c; S.view = 'salida'; S.args = []; window.scrollTo(0, 0);
  $('#head').innerHTML = '<div class="row"><div class="grow"><h2>⬆ ' + esc(c.ev.nombre || c.ev.id) + '</h2><div class="small mut">' + esc(c.ev.id) + ' · ' + fdate(c.ev.carga) + (c.ev.lugar ? ' · ' + esc(c.ev.lugar) : '') + (c.ev.tipo ? ' · ' + esc(c.ev.tipo) : '') + '</div></div>' + pillEv(c.ev.estado) + '</div>';
  scanShow(scanSalida);
  renderSalida();
}
function guardarBorrador() { const c = S.cur; if (!c) return; store('axial-' + c.mode + '-' + c.ev.id, c.mode === 'salida' ? { scanned: c.scanned, granel: c.granel, extraGr: c.extraGr, nota: c.nota } : { vuelto: c.vuelto, granel: c.granel, ubic: c.ubic }); }
function libresDe(modelo) {
  const c = S.cur;
  return S.d.equipos.filter(e => e.modelo === modelo && !c.scanned.includes(e.id) && !c.fueraEq.includes(e.id) && ['Disponible', 'Por revisar'].includes(e.estado) && e.cond !== 'Averiado')
    .sort((a, b) => (a.cond === 'OK' ? 0 : 1) - (b.cond === 'OK' ? 0 : 1) || (a.estado === 'Disponible' ? 0 : 1) - (b.estado === 'Disponible' ? 0 : 1) || a.salidas - b.salidas || a.id.localeCompare(b.id));
}
const cuentaModelo = (lista, modelo) => lista.filter(id => S.eq[id] && S.eq[id].modelo === modelo).length;
function renderSalida() {
  const c = S.cur; let h = '';
  const reservados = new Set(c.eq.map(l => l.codigo)); let faltanTot = 0;
  if (c.eq.length) h += '<h3>Equipos</h3>';
  c.eq.forEach(l => {
    const ya = c.fueraEq.filter(id => S.eq[id] && S.eq[id].modelo === l.codigo), sc = c.scanned.filter(id => S.eq[id].modelo === l.codigo);
    const tot = ya.length + sc.length, falta = Math.max(0, l.cantidad - tot); faltanTot += falta;
    const pct = Math.min(100, l.cantidad ? tot / l.cantidad * 100 : 0), libres = libresDe(l.codigo);
    const desc = (S.d.equipos.find(e => e.modelo === l.codigo) || {}).desc || l.material;
    h += '<div class="card" id="m-' + esc(l.codigo) + '"><div class="row"><div class="grow"><b>' + esc(desc) + '</b><div class="small mut">' + esc(l.codigo) + '</div></div><div class="cnt" style="font-size:20px;color:' + (tot === l.cantidad ? 'var(--ok)' : tot > l.cantidad ? 'var(--warn)' : 'var(--tx)') + '">' + tot + '/' + l.cantidad + '</div></div>' +
      '<div class="prog"><i class="' + (tot === l.cantidad ? 'full' : tot > l.cantidad ? 'over' : '') + '" style="width:' + pct + '%"></i></div>' +
      (l.resultado.length ? '<div style="margin-top:6px">' + l.resultado.map(pillRes).join(' ') + '</div>' : '') +
      '<div class="chips">' + ya.map(id => '<span class="chip out">' + esc(id) + ' · ya fuera</span>').join('') +
      sc.map(id => '<span class="chip ' + (S.eq[id].cond === 'OK' && S.eq[id].estado === 'Disponible' ? 'ok' : 'warn') + '" onclick="quitarSalida(\'' + id + '\')">' + esc(id) + ' ✕</span>').join('') + '</div>' +
      (falta ? '<div class="small mut" style="margin-top:8px">Coge: ' + (libres.length ? libres.slice(0, falta).map(e => '<b style="color:var(--tx)">' + esc(e.id.replace(l.codigo + '-', '·')) + '</b>' + (e.cond !== 'OK' ? '⚠' : '')).join('  ') + (libres.length > falta ? ' <span>(+' + (libres.length - falta) + ' libres)</span>' : '') : '<span style="color:var(--err)">no quedan unidades libres</span>') + '</div>' : '') + '</div>';
  });
  const extras = c.scanned.filter(id => !reservados.has(S.eq[id].modelo));
  if (extras.length) h += '<h3>Fuera de la reserva</h3><div class="card"><div class="small mut">Sale, pero no estaba reservado. Si se queda, añádelo luego a la reserva en la hoja.</div><div class="chips">' + extras.map(id => '<span class="chip warn" onclick="quitarSalida(\'' + id + '\')">' + esc(id) + ' ✕</span>').join('') + '</div></div>';
  const grTodos = c.gr.map(g => g.codigo).concat(c.extraGr.filter(k => !c.gr.some(g => g.codigo === k)));
  if (grTodos.length) h += '<h3>Cables y granel</h3>';
  grTodos.forEach(code => {
    const l = c.gr.find(g => g.codigo === code), info = S.gr[code] || { desc: '', disp: 0 }, ya = c.fueraGr[code] || 0, v = c.granel[code] || 0, over = v > info.disp;
    h += '<div class="card"><div class="row"><div class="grow"><b>' + esc(code) + '</b><div class="small mut">' + esc(info.desc) + '</div>' +
      '<div class="small">' + (l ? 'Reservado ' + l.cantidad : '<span style="color:var(--warn)">No reservado</span>') + (ya ? ' · ya fuera ' + ya : '') + ' · <span style="color:' + (over ? 'var(--err)' : 'var(--mut)') + '">quedan ' + info.disp + ' en almacén</span></div></div>' +
      '<div class="step"><button onclick="granel(\'' + code + '\',-1)">−</button><input inputmode="numeric" value="' + v + '" onchange="granel(\'' + code + '\',0,this.value)"><button onclick="granel(\'' + code + '\',1)">+</button></div></div></div>';
  });
  h += '<button class="btn full" style="margin-top:8px" onclick="anadirGranel()">+ Añadir cable o granel no reservado</button>';
  h += '<h3>Nota (opcional)</h3><textarea id="nota" placeholder="Ej.: carga con Marc, falta comprobar el DMX" oninput="S.cur.nota=this.value;guardarBorrador()">' + esc(c.nota) + '</textarea>';
  if (!c.eq.length && !c.gr.length) h = '<div class="empty">Este evento no tiene material reservado.<br>Puedes escanear igualmente, pero lo correcto es reservarlo antes en la hoja.</div>' + h;
  $('#view').innerHTML = h;
  const nGr = Object.values(c.granel).reduce((s, v) => s + (+v || 0), 0);
  bar('<button class="btn pri full" onclick="confirmarSalida()" ' + (c.scanned.length + nGr ? '' : 'disabled') + '>Registrar salida · ' + c.scanned.length + ' equipos' + (nGr ? ' + ' + nGr + ' granel' : '') + (faltanTot ? ' · faltan ' + faltanTot : '') + '</button>');
}
async function scanSalida(id) {
  const c = S.cur, e = S.eq[id];
  if (!e) { beep('err'); toast(id + ' no existe en Equipos', 'err'); return; }
  if (c.scanned.includes(id)) { beep('warn'); toast(id + ' ya está escaneado', 'warn'); return; }
  if (c.fueraEq.includes(id)) { beep('warn'); toast(id + ' ya salió para este evento', 'warn'); return; }
  if (e.estado === 'En evento' || e.estado === 'Alquilado') { beep('err'); toast(id + ' está fuera en ' + (e.eventoNombre || e.eventoFuera || 'otro evento'), 'err'); return; }
  if (['Para reparar', 'En reparación', 'Perdido', 'Retirado', 'Prestado'].includes(e.estado)) { beep('err'); toast(id + ' está «' + e.estado + '». No puede salir.', 'err'); return; }
  if (e.cond === 'Averiado') { beep('err'); toast(id + ' está averiado. No puede salir.', 'err'); return; }
  const avisos = [];
  if (e.estado === 'Por revisar') avisos.push('Está <b>por revisar</b> (volvió con una incidencia).');
  if (e.cond === 'Con incidencia') avisos.push('Tiene una <b>incidencia</b>' + (e.obs ? ': ' + esc(e.obs) : '') + '.');
  const l = c.eq.find(x => x.codigo === e.modelo);
  if (!l) avisos.push('Este modelo <b>no está en la reserva</b>.');
  else if (cuentaModelo(c.fueraEq, e.modelo) + cuentaModelo(c.scanned, e.modelo) >= l.cantidad) avisos.push('Ya tienes las <b>' + l.cantidad + '</b> unidades reservadas de este modelo.');
  if (avisos.length) {
    beep('warn');
    const r = await modal(id, '<div class="small mut">' + esc(e.desc) + '</div><ul>' + avisos.map(a => '<li>' + a + '</li>').join('') + '</ul>', [{ label: 'Cargarlo igualmente', cls: 'warn', value: true }, { label: 'No, lo dejo', value: false }]);
    if (!r.value) return;
  } else beep('ok');
  c.scanned.push(id); guardarBorrador(); renderSalida();
  toast('✓ ' + id, avisos.length ? 'warn' : 'ok');
  flash(document.getElementById('m-' + e.modelo), avisos.length ? 'var(--warn)' : 'var(--ok)');
}
function quitarSalida(id) { const c = S.cur; c.scanned = c.scanned.filter(x => x !== id); guardarBorrador(); renderSalida(); toast(id + ' quitado', 'info'); }
function granel(code, d, val) {
  const c = S.cur; let v = val !== undefined ? parseInt(val, 10) || 0 : (c.granel[code] || 0) + d;
  if (c.mode === 'entrada') v = Math.min(v, c.fueraGr[code] || 0);
  c.granel[code] = Math.max(0, v); guardarBorrador(); (c.mode === 'salida' ? renderSalida : renderEntrada)();
}
async function anadirGranel() {
  const c = S.cur, ya = new Set(c.gr.map(g => g.codigo).concat(c.extraGr));
  const ops = S.d.granel.filter(g => !ya.has(g.code)).map(g => '<option value="' + esc(g.code) + '">' + esc(g.code + ' · ' + g.desc) + ' (quedan ' + g.disp + ')</option>').join('');
  const r = await modal('Añadir granel', '<select name="code">' + ops + '</select><div style="margin-top:10px"><input type="text" name="qty" inputmode="numeric" value="1" placeholder="Cantidad"></div>', [{ label: 'Añadir', cls: 'pri', value: true }, { label: 'Cancelar', value: false }]);
  if (!r.value || !r.fields.code) return;
  c.extraGr.push(r.fields.code); c.granel[r.fields.code] = Math.max(0, parseInt(r.fields.qty, 10) || 0); guardarBorrador(); renderSalida();
}
async function confirmarSalida() {
  const c = S.cur, faltas = [];
  c.eq.forEach(l => { const tot = cuentaModelo(c.fueraEq, l.codigo) + cuentaModelo(c.scanned, l.codigo); if (tot < l.cantidad) faltas.push((l.cantidad - tot) + ' × ' + l.codigo); });
  c.gr.forEach(l => { const tot = (c.fueraGr[l.codigo] || 0) + (c.granel[l.codigo] || 0); if (tot < l.cantidad) faltas.push((l.cantidad - tot) + ' × ' + l.codigo); });
  const granelOver = Object.keys(c.granel).filter(k => (c.granel[k] || 0) > ((S.gr[k] || {}).disp || 0));
  const nGr = Object.values(c.granel).reduce((s, v) => s + (+v || 0), 0);
  let html = '<p>Van a salir <b>' + c.scanned.length + '</b> equipos' + (nGr ? ' y <b>' + nGr + '</b> unidades de granel' : '') + ' hacia <b>' + esc(c.ev.nombre || c.ev.id) + '</b>.</p>';
  if (faltas.length) html += '<div class="card hl"><b>Falta por cargar respecto a la reserva:</b><br>' + faltas.map(esc).join('<br>') + '<div class="small mut" style="margin-top:6px">Puedes hacer otra salida más tarde para lo que falte.</div></div>';
  if (granelOver.length) html += '<div class="card hl" style="border-left-color:var(--err)"><b>Según la hoja no hay tantas unidades en el almacén:</b><br>' + granelOver.map(k => esc(k) + ': sacas ' + c.granel[k] + ', constan ' + ((S.gr[k] || {}).disp || 0)).join('<br>') + '<div class="small mut" style="margin-top:6px">Si de verdad las tienes, el recuento de la hoja está mal: corrígelo en «Cables y granel».</div></div>';
  if (c.ev.estado === 'Confirmado') html += '<p class="small mut">El evento pasará a «En curso».</p>';
  const r = await modal('¿Registrar la salida?', html, [{ label: 'Sí, registrar salida', cls: 'pri', value: true }, { label: 'Seguir escaneando', value: false }]);
  if (!r.value) return;
  try {
    const res = registrarSalida({ evento: c.ev.id, equipos: c.scanned, granel: Object.keys(c.granel).map(k => ({ code: k, qty: c.granel[k] })).filter(g => g.qty > 0), nota: c.nota });
    store('axial-salida-' + c.ev.id, null); rebuild(); beep('ok');
    toast('Salida registrada: ' + res.equipos + ' equipos' + (res.granel ? ' y ' + res.granel + ' de granel' : ''), 'ok');
    go('evento', c.ev.id);
  } catch (e) { beep('err'); await modal('No se ha guardado', '<p style="white-space:pre-line">' + esc(errMsg(e)) + '</p><p class="small mut">Lo escaneado sigue guardado en el móvil.</p>', [{ label: 'Entendido', value: 1 }]); }
}

// =============== ENTRADA ===============
function abrirEntrada(evId) { try { prepararEntrada(calcEvento(evId)); } catch (e) { toast(errMsg(e), 'err'); } }
function prepararEntrada(r) {
  bar(''); scanHide();
  const c = { mode: 'entrada', ev: r.evento, fueraEq: r.fueraEquipos, fueraGr: r.fueraGranel, vuelto: {}, granel: {}, ubic: (S.d.ubicaciones.includes(CFG.UBIC_ALMACEN) ? CFG.UBIC_ALMACEN : S.d.ubicaciones[0]) };
  Object.keys(c.fueraGr).forEach(k => c.granel[k] = c.fueraGr[k]);
  const draft = store('axial-entrada-' + c.ev.id);
  if (draft && Object.keys(draft.vuelto || {}).length) { Object.keys(draft.vuelto).forEach(id => { if (c.fueraEq.includes(id)) c.vuelto[id] = draft.vuelto[id]; }); Object.keys(draft.granel || {}).forEach(k => { if (k in c.granel) c.granel[k] = Math.min(draft.granel[k], c.fueraGr[k]); }); c.ubic = draft.ubic || c.ubic; setTimeout(() => toast('He recuperado lo que llevabas escaneado', 'info'), 300); }
  S.cur = c; S.view = 'entrada'; S.args = []; window.scrollTo(0, 0);
  $('#head').innerHTML = '<div class="row"><div class="grow"><h2>⬇ ' + esc(c.ev.nombre || c.ev.id) + '</h2><div class="small mut">' + esc(c.ev.id) + ' · vuelta ' + fdate(c.ev.vuelta) + '</div></div>' + pillEv(c.ev.estado) + '</div>';
  scanShow(scanEntrada);
  renderEntrada();
}
function renderEntrada() {
  const c = S.cur; let h = '';
  const n = c.fueraEq.length, v = Object.keys(c.vuelto).length;
  const grPend = Object.keys(c.fueraGr).filter(k => (c.granel[k] || 0) < c.fueraGr[k]), completo = v === n && !grPend.length;
  if (n) {
    h += '<div class="card"><div class="row"><div class="grow"><b>Han vuelto</b><div class="small mut">Toca un equipo escaneado para avisar de una incidencia</div></div><div class="cnt" style="font-size:22px;color:' + (v === n ? 'var(--ok)' : 'var(--tx)') + '">' + v + '/' + n + '</div></div><div class="prog"><i class="' + (v === n ? 'full' : '') + '" style="width:' + (n ? v / n * 100 : 0) + '%"></i></div></div>';
    const porModelo = {};
    c.fueraEq.forEach(id => { const m = (S.eq[id] || {}).modelo || '?'; (porModelo[m] = porModelo[m] || []).push(id); });
    h += '<h3>Equipos</h3>';
    Object.keys(porModelo).sort().forEach(m => {
      const ids = porModelo[m], vv = ids.filter(id => c.vuelto[id]).length;
      h += '<div class="card" id="m-' + esc(m) + '"><div class="row"><div class="grow"><b>' + esc((S.eq[ids[0]] || {}).desc || m) + '</b><div class="small mut">' + esc(m) + '</div></div><div class="cnt">' + vv + '/' + ids.length + '</div></div><div class="chips">' +
        ids.sort().map(id => { const x = c.vuelto[id], cls = !x ? '' : x.cond === 'OK' ? 'ok' : x.cond === 'Averiado' ? 'err' : 'warn'; return '<span class="chip ' + cls + '" onclick="tocarEntrada(\'' + id + '\')">' + (x ? (x.cond === 'OK' ? '✓ ' : '⚠ ') : '') + esc(id) + '</span>'; }).join('') + '</div></div>';
    });
  }
  const grKeys = Object.keys(c.fueraGr);
  if (grKeys.length) {
    h += '<h3>Cables y granel</h3>';
    grKeys.forEach(code => {
      const info = S.gr[code] || { desc: '' }, val = c.granel[code] || 0, out = c.fueraGr[code];
      h += '<div class="card"><div class="row"><div class="grow"><b>' + esc(code) + '</b><div class="small mut">' + esc(info.desc) + '</div><div class="small">Salieron ' + out + (val < out ? ' · <span style="color:var(--warn)">faltan ' + (out - val) + '</span>' : ' · <span style="color:var(--ok)">completo</span>') + '</div></div>' +
        '<div class="step"><button onclick="granel(\'' + code + '\',-1)">−</button><input inputmode="numeric" value="' + val + '" onchange="granel(\'' + code + '\',0,this.value)"><button onclick="granel(\'' + code + '\',1)">+</button></div></div></div>';
    });
  }
  if (!n && !grKeys.length) h += '<div class="empty">No queda nada fuera en este evento.</div>';
  h += '<h3>¿Dónde lo dejas?</h3><select onchange="S.cur.ubic=this.value;guardarBorrador()">' + S.d.ubicaciones.map(u => '<option ' + (u === c.ubic ? 'selected' : '') + '>' + esc(u) + '</option>').join('') + '</select>';
  h += '<label class="chk"><input type="checkbox" id="cerrar" ' + (completo ? 'checked' : 'disabled') + '> <span>Cerrar el evento' + (completo ? '' : ' <span class="small mut">(cuando vuelva todo)</span>') + '</span></label>';
  $('#view').innerHTML = h;
  const nGr = Object.values(c.granel).reduce((s, x) => s + (+x || 0), 0);
  bar('<button class="btn pri full" onclick="confirmarEntrada()" ' + (v + nGr ? '' : 'disabled') + '>Registrar entrada · ' + v + ' equipos' + (nGr ? ' + ' + nGr + ' granel' : '') + '</button>');
}
function scanEntrada(id) {
  const c = S.cur, e = S.eq[id];
  if (!e) { beep('err'); toast(id + ' no existe en Equipos', 'err'); return; }
  if (!c.fueraEq.includes(id)) { beep('err'); toast(id + (e.eventoFuera ? ' es de otro evento: ' + (e.eventoNombre || e.eventoFuera) : ' no salió en este evento'), 'err'); return; }
  if (c.vuelto[id]) { beep('warn'); toast(id + ' ya está marcado', 'warn'); return; }
  c.vuelto[id] = { cond: 'OK', nota: '' }; guardarBorrador(); beep('ok'); toast('✓ ' + id, 'ok'); renderEntrada(); flash(document.getElementById('m-' + e.modelo), 'var(--ok)');
}
async function tocarEntrada(id) {
  const c = S.cur, x = c.vuelto[id];
  if (!x) {
    const r = await modal(id, '<p>¿Marcarlo como devuelto sin escanear? Útil si la etiqueta QR está dañada.</p>', [{ label: 'Sí, ha vuelto', cls: 'pri', value: true }, { label: 'Cancelar', value: false }]);
    if (r.value) { c.vuelto[id] = { cond: 'OK', nota: '' }; guardarBorrador(); renderEntrada(); }
    return;
  }
  const r = await modal(id, '<div class="small mut" style="margin-bottom:10px">' + esc((S.eq[id] || {}).desc) + '</div><div class="seg">' +
    '<label><input type="radio" name="cond" value="OK" ' + (x.cond === 'OK' ? 'checked' : '') + '><span>Bien</span></label>' +
    '<label><input type="radio" class="w" name="cond" value="Con incidencia" ' + (x.cond === 'Con incidencia' ? 'checked' : '') + '><span>Incidencia</span></label>' +
    '<label><input type="radio" class="e" name="cond" value="Averiado" ' + (x.cond === 'Averiado' ? 'checked' : '') + '><span>Averiado</span></label></div>' +
    '<div style="margin-top:10px"><textarea name="nota" placeholder="¿Qué le pasa? (ej.: rejilla abollada, el canal 3 hace ruido)">' + esc(x.nota) + '</textarea></div>' +
    '<p class="small mut">Incidencia → queda «Por revisar». Averiado → «Para reparar». Se apunta en Mantenimiento.</p>',
    [{ label: 'Guardar', cls: 'pri', value: 'ok' }, { label: 'Quitar: no ha vuelto', cls: 'err', value: 'del' }, { label: 'Cancelar', value: '' }]);
  if (r.value === 'ok') c.vuelto[id] = { cond: r.fields.cond || 'OK', nota: r.fields.nota || '' };
  else if (r.value === 'del') delete c.vuelto[id];
  guardarBorrador(); renderEntrada();
}
async function confirmarEntrada() {
  const c = S.cur, ids = Object.keys(c.vuelto), faltan = c.fueraEq.filter(id => !c.vuelto[id]);
  const inc = ids.filter(id => c.vuelto[id].cond !== 'OK'), sinNota = inc.filter(id => !c.vuelto[id].nota.trim());
  if (sinNota.length) { beep('warn'); toast('Describe la incidencia de ' + sinNota.join(', '), 'warn'); return; }
  const grFaltan = Object.keys(c.fueraGr).filter(k => (c.granel[k] || 0) < c.fueraGr[k]).map(k => (c.fueraGr[k] - (c.granel[k] || 0)) + ' × ' + k);
  const cerrar = $('#cerrar') && $('#cerrar').checked;
  let html = '<p>Vuelven <b>' + ids.length + '</b> equipos a «' + esc(c.ubic) + '».</p>';
  if (inc.length) html += '<div class="card hl"><b>Con incidencia:</b><br>' + inc.map(id => esc(id) + ' · ' + esc(c.vuelto[id].cond)).join('<br>') + '</div>';
  if (faltan.length || grFaltan.length) html += '<div class="card hl" style="border-left-color:var(--err)"><b>Siguen fuera:</b><br>' + faltan.map(esc).concat(grFaltan.map(esc)).join('<br>') + '<div class="small mut" style="margin-top:6px">El evento seguirá «En curso» hasta que vuelva todo. Si algo se ha perdido, márcalo en la hoja.</div></div>';
  else if (cerrar) html += '<p class="small mut">Ha vuelto todo: el evento pasará a «Cerrado».</p>';
  const r = await modal('¿Registrar la entrada?', html, [{ label: 'Sí, registrar entrada', cls: 'pri', value: true }, { label: 'Seguir escaneando', value: false }]);
  if (!r.value) return;
  try {
    const res = registrarEntrada({ evento: c.ev.id, equipos: ids.map(id => ({ id, cond: c.vuelto[id].cond, nota: c.vuelto[id].nota })), granel: Object.keys(c.granel).map(k => ({ code: k, qty: c.granel[k] })).filter(g => g.qty > 0), ubic: c.ubic, cerrar });
    store('axial-entrada-' + c.ev.id, null); rebuild(); beep('ok');
    await modal('Entrada registrada ✓', '<p><b>' + res.equipos + '</b> equipos de vuelta' + (res.incidencias ? ', <b>' + res.incidencias + '</b> con incidencia apuntada en Mantenimiento' : '') + '.</p>' +
      (res.quedanEquipos.length || res.quedanGranel.length ? '<p>Siguen fuera: ' + res.quedanEquipos.concat(res.quedanGranel).map(esc).join(', ') + '</p>' : '') + (res.cerrado ? '<p>Evento cerrado.</p>' : ''), [{ label: 'Hecho', cls: 'pri', value: 1 }]);
    go('home');
  } catch (e) { beep('err'); await modal('No se ha guardado', '<p style="white-space:pre-line">' + esc(errMsg(e)) + '</p><p class="small mut">Lo escaneado sigue guardado en el móvil.</p>', [{ label: 'Entendido', value: 1 }]); }
}

// =============== CONSULTAR ===============
VIEWS.consulta = () => {
  $('#head').innerHTML = '<h2>🔍 Consultar</h2><div class="small mut">Escanea un QR, o escribe parte del ID o del modelo.</div>';
  scanShow(id => { if (S.eq[id]) { beep('ok'); verFicha(id); } else buscar(id); }, 'ID o modelo');
  $('#manual').oninput = () => buscar($('#manual').value, true);
  $('#view').innerHTML = '<div id="res"></div>';
};
function buscar(q, vivo) {
  q = norm(q); const box = $('#res'); if (!box) return;
  if (q.length < 2) { box.innerHTML = ''; return; }
  const l = S.d.equipos.filter(e => e.id.includes(q) || norm(e.desc).includes(q)).slice(0, 40);
  if (!vivo && !l.length) { beep('err'); toast(q + ' no existe en Equipos', 'err'); }
  box.innerHTML = l.map(e => '<div class="card tap" onclick="verFicha(\'' + esc(e.id) + '\')"><div class="row"><div class="grow"><b>' + esc(e.id) + '</b><div class="small mut">' + esc(e.desc) + ' · ' + esc(e.prop) + '</div></div>' + pillEstado(e.estado) + '</div></div>').join('') || (vivo ? '<div class="empty">Sin resultados</div>' : '');
}
function verFicha(id) {
  let r; try { r = calcFicha(id); } catch (e) { toast(errMsg(e), 'err'); return; }
  S.view = 'ficha'; S.args = [id]; scanHide(); bar(''); window.scrollTo(0, 0);
  const e = r.equipo;
  $('#head').innerHTML = '<h2 style="font-size:22px">' + esc(e.id) + '</h2><div class="mut">' + esc(e.desc) + '</div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + pillEstado(e.estado) + pillCond(e.cond) + '<span class="pill">' + esc(e.prop === 'Kronik' ? 'KRONIK' : 'AXIAL') + '</span></div>';
  let h = '';
  if (e.eventoFuera) { const ev = S.ev[e.eventoFuera]; h += '<div class="card tap hl" style="border-left-color:var(--blue)" onclick="go(\'evento\',\'' + esc(e.eventoFuera) + '\')">Está en <b>' + esc(ev ? ev.nombre || ev.id : e.eventoFuera) + '</b>' + (ev ? ' · vuelve ' + fdate(ev.vuelta) : '') + '</div>'; }
  if (e.acc) h += '<div class="card hl"><b>Lleva:</b> ' + esc(e.acc) + '</div>';
  if (e.obs) h += '<div class="card hl"><b>Observaciones:</b> ' + esc(e.obs) + '</div>';
  h += '<div class="card kv"><div>Categoría</div><div>' + esc(e.cat) + '</div><div>Nº de serie</div><div>' + esc(e.serie || '—') + '</div><div>Ubicación</div><div>' + esc(e.ubic || '—') + '</div>' +
    '<div>Contenedor</div><div>' + esc(e.cont || '—') + '</div><div>Revisión</div><div>' + esc(e.aviso || '—') + (e.prox ? ' · ' + fdate(e.prox) : '') + '</div><div>Salidas</div><div>' + e.salidas + '</div></div>';
  h += '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px"><button class="btn warn full" onclick="incidencia(\'' + esc(e.id) + '\')">⚠ Avisar de una incidencia o avería</button>';
  if (e.cond !== 'OK' || ['Por revisar', 'Para reparar', 'En reparación'].includes(e.estado)) h += '<button class="btn ok full" onclick="revisado(\'' + esc(e.id) + '\')">✓ Revisado: funciona bien</button>';
  h += '<button class="btn full" onclick="go(\'consulta\')">Escanear otro</button></div>';
  h += '<h3>Últimos movimientos</h3>' + (r.movimientos.length ? r.movimientos.map(m => '<div class="card small"><div class="row"><b class="grow">' + esc(m.tipo) + (m.evento ? ' · ' + esc(m.evento) : '') + '</b><span class="mut">' + esc(m.fecha) + '</span></div>' + (m.notas ? '<div class="mut">' + esc(m.notas) + '</div>' : '') + '</div>').join('') : '<div class="small mut">Todavía no ha salido.</div>');
  h += '<h3>Mantenimiento</h3>' + (r.mantenimiento.length ? r.mantenimiento.map(m => '<div class="card small"><div class="row"><b class="grow">' + esc(m.tipo) + '</b>' + (m.resultado === 'Pendiente' ? '<span class="pill p-warn">Pendiente</span>' : pillRes(m.resultado === 'Apto' ? 'OK' : m.resultado)) + '</div><div>' + esc(m.desc) + '</div>' + (m.fecha ? '<div class="mut">' + fdate(m.fecha) + '</div>' : '') + '</div>').join('') : '<div class="small mut">Sin registros.</div>');
  $('#view').innerHTML = h;
}
async function incidencia(id) {
  const r = await modal('Incidencia · ' + id, '<div class="seg"><label><input type="radio" class="w" name="cond" value="Con incidencia" checked><span>Incidencia<br><span class="small mut">funciona, con un problema</span></span></label><label><input type="radio" class="e" name="cond" value="Averiado"><span>Averiado<br><span class="small mut">no puede salir</span></span></label></div><div style="margin-top:10px"><textarea name="desc" placeholder="¿Qué le pasa?"></textarea></div>',
    [{ label: 'Guardar incidencia', cls: 'warn', value: true }, { label: 'Cancelar', value: false }]);
  if (!r.value) return;
  if (!String(r.fields.desc || '').trim()) { toast('Describe qué le pasa', 'warn'); return; }
  try { reportarIncidencia({ id, cond: r.fields.cond, desc: r.fields.desc }); rebuild(); toast('Incidencia apuntada', 'ok'); verFicha(id); } catch (e) { toast(errMsg(e), 'err'); }
}
async function revisado(id) {
  const r = await modal('¿Revisado y OK?', '<p>' + esc(id) + ' volverá a «OK» y «Disponible». Las averías pendientes se marcarán como resueltas en Mantenimiento.</p><textarea name="nota" placeholder="Qué has hecho (opcional)"></textarea>', [{ label: 'Sí, funciona bien', cls: 'ok', value: true }, { label: 'Cancelar', value: false }]);
  if (!r.value) return;
  try { marcarRevisado({ id, nota: r.fields.nota }); rebuild(); toast(id + ' disponible', 'ok'); verFicha(id); } catch (e) { toast(errMsg(e), 'err'); }
}

// =============== EVENTOS ===============
VIEWS.eventos = () => {
  $('#head').innerHTML = '<h2>📅 Eventos</h2><input type="search" id="q" placeholder="Buscar por nombre, cliente, lugar o código" style="margin-top:8px"><label class="chk small"><input type="checkbox" id="viejos"> Mostrar cerrados y cancelados</label>';
  const pintar = () => {
    const q = norm($('#q').value), viejos = $('#viejos').checked;
    const l = S.d.eventos.filter(e => (viejos || (e.estado !== 'Cerrado' && e.estado !== 'Cancelado')) && (!q || norm([e.id, e.nombre, e.cliente, e.lugar].join(' ')).includes(q))).sort((a, b) => (a.carga || '9').localeCompare(b.carga || '9'));
    $('#view').innerHTML = l.length ? l.map(e => evCard(e, '<div class="small mut" style="margin-top:4px">' + e.lineas + ' líneas' + (e.conflictos ? ' · <span style="color:var(--err)">' + e.conflictos + ' con problemas</span>' : '') + (e.fueraEquipos ? ' · ' + e.fueraEquipos + ' equipos fuera' : '') + '</div>', "go('evento','" + esc(e.id) + "')")).join('') : '<div class="empty">No hay eventos.</div>';
  };
  $('#q').oninput = pintar; $('#viejos').onchange = pintar; pintar();
};
VIEWS.evento = evId => {
  let r; try { r = calcEvento(evId); } catch (e) { toast(errMsg(e), 'err'); go('home'); return; }
  const e = r.evento;
  $('#head').innerHTML = '<div class="row"><div class="grow"><h2>' + esc(e.nombre || e.id) + '</h2><div class="small mut">' + esc(e.id) + '</div></div>' + pillEv(e.estado) + '</div>';
  let h = '<div class="card kv"><div>Cliente</div><div>' + esc(e.cliente || '—') + '</div><div>Tipo</div><div>' + esc(e.tipo || '—') + '</div><div>Lugar</div><div>' + esc(e.lugar || '—') + '</div><div>Carga</div><div>' + fdate(e.carga) + '</div><div>Vuelta</div><div>' + fdate(e.vuelta) + (e.estado === 'En curso' && e.vuelta && e.vuelta < S.d.hoy ? ' <span class="pill p-err">atrasada</span>' : '') + '</div></div>';
  if (e.notas) h += '<div class="card hl">' + esc(e.notas) + '</div>';
  const nFuera = r.fueraEquipos.length, gFuera = Object.values(r.fueraGranel).reduce((s, v) => s + v, 0);
  if (nFuera || gFuera) h += '<div class="card"><b>Fuera ahora:</b> ' + nFuera + ' equipos' + (gFuera ? ' y ' + gFuera + ' de granel' : '') + '</div>';
  h += '<h3>Reserva (' + r.lineas.length + ' líneas)</h3>';
  h += r.lineas.length ? r.lineas.map(l => {
    const sal = l.tipo === 'Equipo' ? cuentaModelo(r.fueraEquipos, l.codigo) : (r.fueraGranel[l.codigo] || 0);
    return '<div class="card"><div class="row"><div class="grow"><b>' + esc(l.cantidad) + ' × ' + esc(l.codigo || '—') + '</b><div class="small mut">' + esc(String(l.material).replace(/^\S+\s·\s/, '')) + '</div>' + (sal ? '<div class="small">Fuera: ' + sal + '</div>' : '') + '</div>' + pillRes(l.resultado) + '</div></div>';
  }).join('') : '<div class="small mut">Sin material reservado.</div>';
  $('#view').innerHTML = h;
  const btns = [];
  if (e.estado === 'Confirmado' || e.estado === 'En curso') btns.push('<button class="btn pri" style="flex:1" onclick="abrirSalida(\'' + esc(e.id) + '\')">⬆ Salida</button>');
  if (nFuera || gFuera) btns.push('<button class="btn" style="flex:1" onclick="abrirEntrada(\'' + esc(e.id) + '\')">⬇ Entrada</button>');
  bar(btns.join(''));
};

// =============== Arranque ===============
function arrancar() {
  $('#btnHome').onclick = () => { if (S.d) go('home'); };
  $('#btnSync').onclick = () => tocarSync();
  $('#btnCam').onclick = () => { if (SCAN.on) { camStop(); store('axial-cam', false); } else { store('axial-cam', true); camStart(); } };
  $('#btnManual').onclick = () => { const v = $('#manual').value; $('#manual').value = ''; SCAN.last = ''; onCode(v); };
  $('#manual').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#btnManual').click(); } });
  $('#btnFoto').onclick = () => $('#scanFile').click();
  $('#scanFile').onchange = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; scanInit();
    const wasOn = SCAN.on; if (wasOn) await camStop();
    try { const t = await SCAN.qr.scanFile(f, false); SCAN.last = ''; onCode(t); } catch (err) { beep('err'); toast('No encuentro ningún QR en la foto.', 'err'); }
    if (wasOn && SCAN.handler) camStart();
  };
  if (cargarCache()) {
    try { rebuild(); go('home'); } catch (e) { DB.t = null; }
  }
  if (!DB.t) { go('login'); return; }
  pintarSync();
  sync();
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
window.addEventListener('load', arrancar);
