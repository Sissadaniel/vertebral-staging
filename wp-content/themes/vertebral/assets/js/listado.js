/* Vertebral · listado de proyectos: lista convencional.
 * - Orden alfabético (con una letra de cabecera por inicial) o por año.
 * - Buscador por nombre, lugar, tipología o año, y filtros de tipología y país (uno de cada a la vez).
 * - La foto del proyecto sigue al cursor al pasar por una fila (en táctil queda una miniatura fija); con teclado aparece junto a la fila.
 * El router vuela la foto de la fila (img.base de .pieza-enlace) a la ficha, igual que antes con las tarjetas. */
(function () {
  'use strict';
  window.VTB.montar.push(function (main) {
    var raiz = main.querySelector('[data-listado]');
    if (!raiz) { return; }
    var limp = [];
    function esc(o, e, f, op) { o.addEventListener(e, f, op); limp.push(function () { o.removeEventListener(e, f, op); }); }
    var lista = raiz.querySelector('[data-lista]'), vacio = raiz.querySelector('[data-vacio]'), cuenta = raiz.querySelector('[data-cuenta]');
    var buscar = raiz.querySelector('[data-buscar]');
    var filas = [].slice.call(lista.querySelectorAll('.fila'));
    var fino = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    var sinAcento = function (t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };

    filas.forEach(function (f) {
      f._nombre = sinAcento(f.dataset.nombre).replace(/^[^a-z0-9]+/, '');   // «% Arabica» se ordena (y agrupa) bajo la A
      f._busca = sinAcento(f.dataset.busca);
      f._anio = parseInt(f.dataset.anio, 10) || 0;
      f._tip = (f.dataset.tip || '').split(' ').filter(Boolean); f._pais = f.dataset.pais || ''; f._ctx = (f.dataset.ctx || '').split(' ').filter(Boolean); f._kw = (f.dataset.kw || '').split(' ').filter(Boolean);
    });
    var estado = { q: '', tip: '', pais: '', ctx: '', kw: '', orden: 'az' };

    var pintar = function () {
      // letras de cabecera: se rehacen en cada cambio
      [].slice.call(lista.querySelectorAll('.fila-letra')).forEach(function (n) { n.remove(); });
      var vis = filas.filter(function (f) {
        var ok = (!estado.tip || f._tip.indexOf(estado.tip) > -1) && (!estado.pais || f._pais === estado.pais) && (!estado.ctx || f._ctx.indexOf(estado.ctx) > -1) && (!estado.kw || f._kw.indexOf(estado.kw) > -1) && (!estado.q || f._busca.indexOf(estado.q) > -1);
        f.hidden = !ok; return ok;
      });
      vis.sort(estado.orden === 'anio'
        ? function (a, b) { return (b._anio - a._anio) || a._nombre.localeCompare(b._nombre); }
        : function (a, b) { return a._nombre.localeCompare(b._nombre); });
      var previa = '';
      vis.forEach(function (f) {
        if (estado.orden === 'az') {
          var l = (f._nombre.charAt(0) || '#').toUpperCase(); if (!/[A-Z]/.test(l)) { l = '#'; }
          if (l !== previa) { var h = document.createElement('li'); h.className = 'fila-letra'; h.setAttribute('aria-hidden', 'true'); h.textContent = l; lista.appendChild(h); previa = l; }
        } else if (f._anio !== previa) {
          var h2 = document.createElement('li'); h2.className = 'fila-letra'; h2.setAttribute('aria-hidden', 'true'); h2.textContent = f._anio || '—'; lista.appendChild(h2); previa = f._anio;
        }
        lista.appendChild(f);
      });
      filas.filter(function (f) { return f.hidden; }).forEach(function (f) { lista.appendChild(f); });
      if (cuenta) { cuenta.textContent = String(vis.length); }
      var cc = raiz.querySelector('[data-cuenta-cajon]'); if (cc) { cc.textContent = String(vis.length); }
      var nAct = (estado.tip ? 1 : 0) + (estado.pais ? 1 : 0) + (estado.ctx ? 1 : 0) + (estado.kw ? 1 : 0), bn = raiz.querySelector('[data-filtro-n]');
      if (bn) { bn.hidden = !nAct; bn.textContent = String(nAct); }
      if (vacio) { vacio.hidden = vis.length > 0; }
    };

    /* filtros y orden */
    var pildoras = [].slice.call(raiz.querySelectorAll('.filtro[data-grupo]'));
    var ordenes = [].slice.call(raiz.querySelectorAll('[data-orden]'));
    var pintarPildoras = function () {
      pildoras.forEach(function (b) { b.setAttribute('aria-pressed', (estado[b.dataset.grupo] || '') === b.dataset.valor ? 'true' : 'false'); });
      ordenes.forEach(function (b) { b.setAttribute('aria-pressed', estado.orden === b.dataset.orden ? 'true' : 'false'); });
    };
    pildoras.forEach(function (b) {
      esc(b, 'click', function () {
        var activo = estado[b.dataset.grupo] === b.dataset.valor && b.dataset.valor !== '';
        estado.tip = estado.pais = estado.ctx = estado.kw = '';
        if (!activo) { estado[b.dataset.grupo] = b.dataset.valor; }
        pintarPildoras(); pintar();
      });
    });
    ordenes.forEach(function (b) { esc(b, 'click', function () { estado.orden = b.dataset.orden; pintarPildoras(); pintar(); }); });
    if (buscar) { esc(buscar, 'input', function () { estado.q = sinAcento(buscar.value.trim()); pintar(); }); }

    /* cajón lateral de filtros (mismo que el de la portada) */
    var abrir = raiz.querySelector('[data-filtros-abrir]'), cajon = raiz.querySelector('[data-cajon]'), fondo = raiz.querySelector('[data-cajon-fondo]');
    var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var abierto = function () { return cajon.classList.contains('abierto'); };
    var abrirCajon = function () {
      cajon.hidden = false; fondo.hidden = false; abrir.setAttribute('aria-expanded', 'true');
      void cajon.offsetWidth; cajon.classList.add('abierto'); fondo.classList.add('abierto');
      var p = cajon.querySelector('.filtro, button'); if (p) { p.focus({ preventScroll: true }); }
    };
    var cerrarCajon = function () {
      cajon.classList.remove('abierto'); fondo.classList.remove('abierto'); abrir.setAttribute('aria-expanded', 'false');
      setTimeout(function () { if (!abierto()) { cajon.hidden = true; fondo.hidden = true; } }, quieto ? 0 : 320);
      abrir.focus({ preventScroll: true });
    };
    if (abrir && cajon) {
      esc(abrir, 'click', function () { if (abierto()) { cerrarCajon(); } else { abrirCajon(); } });
      esc(fondo, 'click', cerrarCajon);
      esc(cajon.querySelector('[data-cajon-cerrar]'), 'click', cerrarCajon);
      esc(document, 'keydown', function (e) { if (e.key === 'Escape' && abierto()) { e.stopPropagation(); cerrarCajon(); } }, true);
      var limpiar = cajon.querySelector('[data-filtro-limpiar]');
      if (limpiar) { esc(limpiar, 'click', function () { estado.tip = estado.pais = estado.ctx = estado.kw = ''; pintarPildoras(); pintar(); }); }
    }

    var q = new URLSearchParams(location.search);
    estado.tip = q.get('tip') || raiz.dataset.previoTip || '';
    estado.pais = q.get('pais') || raiz.dataset.previoPais || '';
    estado.ctx = q.get('ctx') || raiz.dataset.previoCtx || '';
    estado.kw = q.get('kw') || raiz.dataset.previoKw || '';
    pintarPildoras(); pintar();

    /* ───────── La foto sigue al cursor (puntero fino) o se coloca junto a la fila (teclado) ───────── */
    var colocar = function (fila, x, y) {
      var pv = fila.querySelector('.fila-previa'); if (!pv) { return; }
      var ar = parseFloat(pv.dataset.ar) || 1.5, w = Math.min(360, innerWidth * 0.34), h = w / ar;
      var px = x + 30; if (px + w > innerWidth - 12) { px = x - 30 - w; }
      var py = Math.max(12, Math.min(innerHeight - h - 12, y - h / 2));
      pv.style.width = w + 'px'; pv.style.left = Math.max(12, px) + 'px'; pv.style.top = py + 'px';
    };
    if (fino) {
      esc(lista, 'pointermove', function (e) {
        var f = e.target.closest && e.target.closest('.fila'); if (f && !f.hidden) { colocar(f, e.clientX, e.clientY); }
      }, { passive: true });
    }
    esc(lista, 'focusin', function (e) {
      var f = e.target.closest && e.target.closest('.fila'); if (!f) { return; }
      var r = f.getBoundingClientRect(); colocar(f, r.right - 360, r.top + r.height / 2);
    });
    return function () { limp.forEach(function (f) { f(); }); };
  });
})();
