/* Vertebral · portada: campo infinito de proyectos.
 * Una banda de filas fijas que se repite hacia los lados (solo existen en el DOM las celdas visibles). Se recorre arrastrando con
 * inercia, con la rueda o con el teclado, y cualquier movimiento (horizontal o vertical) desplaza el campo solo en horizontal; no
 * hay zoom. La pieza más cercana al puntero (o al centro) cobra color; al hacer clic, el campo se centra en ella, el resto se
 * desvanece y la imagen vuela a su lugar en la ficha (lo orquesta router.js con VTB.heroVolar). */
(function () {
  'use strict';
  var VTB = window.VTB;
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';

  // Celdas grandes y sin contacto: la holgura entre celdas (STEP − TILE) debe superar el desplazamiento relativo máximo de dos vecinas
  // (2 × (JIT_POS + ONDA)) más lo que crece la celda en foco (×1.22, `--k` en campo.css). Si se agrandan TILE/JIT_POS/ONDA, subir STEP y revisar con la prueba de solapes (ver CLAUDE.md).
  var ESTRECHO = window.innerWidth < 720;
  var TILE = ESTRECHO ? 200 : 264, HUECO_MAX = 1.25, HUECO_MIN = 0.75, COLS_MAX = 7;
  var STEP = ESTRECHO ? 320 : 400;   // paso fijo entre celdas: ya no hay zoom
  var ZINICIO = 1;                               // tamaño fijo: el que tenía el campo al 100 %
  var modoObjeto = true;                         // true: las celdas con objeto sin fondo lo muestran; false: siempre la foto principal
  if (window.VTB) { VTB.modoObjetoActivo = function () { return modoObjeto; }; }   // el router lo consulta para decidir el origen del vuelo de vuelta
  var filtroGuardado = { tip: [], pais: [], ctx: [] };   // el filtro elegido sobrevive al ir a una ficha y volver
  var JIT_POS = 28;                                    // amplitud del desplazamiento aleatorio de cada celda (px por eje)
  var ONDA = 12;                                       // amplitud de una ondulación suave que rompe las filas y columnas rectas
  var ruido = function (c, r, sal) { var x = Math.sin(c * 127.1 + r * 311.7 + sal * 74.7) * 43758.5453; return x - Math.floor(x); };
  /* desplazamiento estable de la celda (c,r): azar propio + ondulación lenta; las imágenes no se giran ni se escalan */
  var desplazamiento = function (c, r) {
    return [
      (ruido(c, r, 1) * 2 - 1) * JIT_POS + Math.sin(r * 1.37 + c * 0.53) * ONDA,
      (ruido(c, r, 2) * 2 - 1) * JIT_POS + Math.cos(c * 1.21 + r * 0.61) * ONDA
    ];
  };
  var vistaGuardada = null;          // {ox, oy, escala}: al volver de una ficha, el campo reaparece donde estaba

  /* rótulo de título: misma estructura que vtb_rotulado() de PHP (una letra por <span>) */
  function rotular(el, texto, semilla) {
    el.textContent = '';
    var i = 0;
    texto.split(/(\s+)/).forEach(function (w) {
      if (!w) { return; }
      if (/^\s+$/.test(w)) { el.appendChild(document.createTextNode(' ')); return; }
      var pal = document.createElement('span'); pal.className = 'palabra';
      Array.from(w).forEach(function (c) {
        var l = document.createElement('span'); l.className = 'letra'; l.textContent = c; l.style.setProperty('--n', i);
        pal.appendChild(l); i++;
      });
      el.appendChild(pal); i++;
    });
  }

  VTB.montar.push(function (main) {
    var campo = main.querySelector('[data-campo]');
    if (!campo) { return; }
    var escena = campo.querySelector('[data-escena]'), rejilla = campo.querySelector('[data-rejilla]');
    var todos = JSON.parse(campo.querySelector('[data-piezas]').textContent);
    var datos = todos, N = todos.length;
    if (!N) { return; }
    var ayuda = campo.querySelector('[data-ayuda]'), lista = campo.querySelector('[data-lista]');

    var limpiezas = [];
    var oyente = function (o, e, f, op) { o.addEventListener(e, f, op); limpiezas.push(function () { o.removeEventListener(e, f, op); }); };

    var W = 0, H = 0;
    var escala = ZINICIO, ox = 0, oy = 0;
    var tiles = new Map();                 // "c,r" → {el, img, c, r, i}
    var bloqueado = false, intro = false, focoActual = null, ptr = { x: null, y: null, dentro: false };
    var raf = 0;

    /* El campo solo se mueve en horizontal. Las columnas NO son todas iguales: siguen un patrón que se repite (PATRON = filas por columna), con
       columnas de 2 y de 3 filas mezcladas. Todas ocupan el alto de la pantalla, así que las de 3 filas llevan celdas más pequeñas (paso = alto / filas,
       como mucho STEP) y por tanto son más estrechas. Los N proyectos se reparten a lo largo de las celdas en orden (cum(c) = celdas anteriores a la
       columna c), así que recorriendo hacia un lado aparecen todos, sin moverse en vertical. */
    var PATRON = [2, 3, 2, 2, 3, 2, 3, 2], P = PATRON.length, PREF = [0];
    PATRON.forEach(function (k) { PREF.push(PREF[PREF.length - 1] + k); });
    var S = PREF[P];                                          // celdas por periodo del patrón
    var RATIO = TILE / STEP;                                  // parte de la celda que ocupa la imagen: lo que queda es la holgura contra el contacto
    var geo = { 2: null, 3: null }, XP = [0], WP = 1, geoH = -1;
    var mod = function (a, m) { return ((a % m) + m) % m; };
    var kCol = function (c) { return PATRON[mod(c, P)]; };
    var cum = function (c) { return Math.floor(c / P) * S + PREF[mod(c, P)]; };
    var X = function (c) { return Math.floor(c / P) * WP + XP[mod(c, P)]; };   // borde izquierdo de la columna c
    var colEn = function (x) {                                // columna que contiene la coordenada x
      var q = Math.floor(x / WP), r = x - q * WP, m = 0;
      while (m < P - 1 && XP[m + 1] <= r) { m++; }
      return q * P + m;
    };
    var calcGeo = function () {
      [2, 3].forEach(function (k) {
        var paso = Math.min(H / k, STEP);
        geo[k] = { paso: paso, tile: paso * RATIO, sc: paso / STEP, oy: (H - k * paso) / 2 };
      });
      XP = [0]; PATRON.forEach(function (k) { XP.push(XP[XP.length - 1] + geo[k].paso); });
      WP = XP[P];
    };
    // centro (en coordenadas de la rejilla) de la celda (c,r), con su desplazamiento ya aplicado
    var centroCelda = function (c, r) {
      var g = geo[kCol(c)], d = desplazamiento(c, r);
      return [X(c) + g.paso / 2 + d[0] * g.sc, g.oy + r * g.paso + g.paso / 2 + d[1] * g.sc];
    };
    var OY = 0;
    var mapa = null;                       // con un filtro: los índices de los proyectos que cumplen, en orden y sin repetirse; null = campo completo que se repite
    var indice = function (c, r) {
      var k = cum(c) + r;
      if (mapa) { return (c < 0 || k >= mapa.length) ? -1 : mapa[k]; }
      return mod(k, N);
    };
    var medir = function () {
      var b = escena.getBoundingClientRect(); W = b.width; H = b.height;
      if (H !== geoH) {                                       // la geometría depende del alto: si cambia, se rehacen las celdas
        geoH = H; calcGeo();
        tiles.forEach(function (t) { if (!t.el.classList.contains('elegida')) { t.el.remove(); } }); tiles.clear();
      }
      oy = OY;
    };

    /* ───────── Celdas: solo las visibles existen ───────── */
    /* con objeto sin fondo (y el interruptor en «Objetos») la celda muestra el objeto; si no, la foto principal. Conserva su proporción en la celda cuadrada. */
    var ponerImagen = function (el, img, p) {
      var usaObjeto = modoObjeto && !!p.objeto, ar = usaObjeto ? p.ar_objeto : p.ar;
      var el_ = VTB.fotoElegida && VTB.fotoElegida[p.id];      // última imagen de la galería que se dejó a la vista en la ficha de este proyecto
      if (!usaObjeto && el_) { ar = el_.ar; }
      img.src = usaObjeto ? (p.objeto_mini || p.objeto) : (el_ ? el_.src : p.mini);   // la celda mide ~150 px: la versión grande sólo se usa en el vuelo a la ficha
      el.classList.toggle('es-objeto', usaObjeto);
      img.style.width = img.style.height = '';
      if (ar >= 1) { img.style.width = '100%'; } else { img.style.height = '100%'; }
    };

    var crearTile = function (c, r) {
      var i = indice(c, r); if (i < 0) { return null; }      // con filtro, fuera del grupo de resultados no hay celdas
      var p = datos[i];
      var el = document.createElement('div'); el.className = 'campo-tile';
      var g = geo[kCol(c)];
      el.style.width = el.style.height = g.tile + 'px';
      el.style.left = (X(c) + (g.paso - g.tile) / 2) + 'px'; el.style.top = (g.oy + r * g.paso + (g.paso - g.tile) / 2) + 'px';
      // distorsión de la rejilla, estable: cada celda se desplaza un poco (siempre igual para la misma celda; menos en las de 3 filas, que son más pequeñas); las imágenes no se giran ni se escalan
      var d = desplazamiento(c, r); el.style.translate = (d[0] * g.sc) + 'px ' + (d[1] * g.sc) + 'px';
      el.dataset.i = i;
      var img = document.createElement('img'); img.alt = ''; img.draggable = false; img.decoding = 'async';
      ponerImagen(el, img, p);
      el.appendChild(img); rejilla.appendChild(el);
      var t = { el: el, img: img, c: c, r: r, i: i };
      tiles.set(c + ',' + r, t);
      if (typeof marcarTile === 'function') { marcarTile(t); }
      return t;
    };

    var sincronizar = function () {
      var buf = 1;
      var c0 = colEn(-ox / escala) - buf, c1 = colEn((W - ox) / escala) + buf;
      tiles.forEach(function (t, k) {
        if (t.c < c0 || t.c > c1) { if (!t.el.classList.contains('elegida')) { t.el.remove(); tiles.delete(k); } }
      });
      for (var c = c0; c <= c1; c++) { for (var r = 0; r < kCol(c); r++) { if (!tiles.has(c + ',' + r)) { crearTile(c, r); } } }
    };

    var aplicar = function () { rejilla.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + escala + ')'; document.body.style.backgroundPosition = ox + 'px 0'; };   // el papel de fondo viaja con el campo

    /* ───────── Foco: la celda más cercana al puntero (o al centro) ───────── */
    var celdaCercana = function (x, y) {
      var gx = (x - ox) / escala, gy = (y - oy) / escala;
      // con celdas desplazadas, la más cercana puede no ser la de la columna recta: se comparan las de las columnas vecinas
      var c0 = colEn(gx), mejor = [c0, 0], dm = Infinity;
      for (var cc = c0 - 1; cc <= c0 + 1; cc++) {
        for (var rr = 0; rr < kCol(cc); rr++) {
          var ce = centroCelda(cc, rr), dist = Math.hypot(ce[0] - gx, ce[1] - gy);
          if (dist < dm) { dm = dist; mejor = [cc, rr]; }
        }
      }
      return mejor;
    };
    var actualizarFoco = function () {
      var x = ptr.dentro ? ptr.x : W / 2, y = ptr.dentro ? ptr.y : H / 2;
      var cr = celdaCercana(x, y), t = tiles.get(cr[0] + ',' + cr[1]);
      if (t && t.el.classList.contains('fuera')) { t = null; }
      if (t === focoActual) { return; }
      if (focoActual) { focoActual.el.classList.remove('foco'); }
      focoActual = t || null;
      if (!t) { return; }
      t.el.classList.add('foco');
    };

    /* ───────── Vista previa que sigue al puntero: sobre cualquier celda (objeto o foto) aparece la foto del proyecto en grande, sin título ───────── */
    var previa = document.createElement('div'); previa.className = 'campo-previa'; previa.setAttribute('aria-hidden', 'true');
    var previaImg = document.createElement('img'); previaImg.alt = ''; previaImg.decoding = 'async'; previa.appendChild(previaImg);
    var previaNombre = document.createElement('span'); previaNombre.className = 'campo-previa-nombre'; previa.appendChild(previaNombre);
    var previaAnio = document.createElement('span'); previaAnio.className = 'campo-previa-anio'; previa.appendChild(previaAnio);
    escena.appendChild(previa);
    var previaId = null;
    var actualizarPrevia = function () {
      var t = focoActual, p = t && datos[t.i];
      var ver = !!(p && ptr.dentro && !arrastra && !bloqueado && !campo.classList.contains('saliendo'));
      if (!ver) { previa.classList.remove('visible'); return; }
      if (previaId !== p.id) {
        previaId = p.id; previaImg.src = p.grande || p.mini;
        previa.style.setProperty('--ar', p.ar || 1.5);
        rotular(previaNombre, p.titulo, p.id);
        previaAnio.textContent = p.anio ? String(p.anio) : '';
      }
      var w = previa.offsetWidth || 320, h = previa.offsetHeight || 220;
      var x = ptr.x + 26, y = ptr.y - h - 18;
      if (x + w > W - 12) { x = ptr.x - w - 26; }
      if (y < 12) { y = ptr.y + 24; }
      previa.style.transform = 'translate(' + Math.max(12, x).toFixed(1) + 'px,' + Math.max(12, Math.min(y, H - h - 12)).toFixed(1) + 'px)';
      previa.classList.add('visible');
    };

    var tick = function () { raf = 0; sincronizar(); actualizarFoco(); actualizarPrevia(); };
    var pedirTick = function () { if (!raf) { raf = requestAnimationFrame(tick); } };

    /* ───────── Zoom ───────── */
    /* Sin zoom: el tamaño es fijo. Estas funciones quedan como constantes porque otras partes las llaman. */
    var pintarZoom = function () {};
    var pasoPara = function () { return STEP; };
    var recolocar = function () {};

    /* ───────── Arrastre con inercia, pellizco y rueda ───────── */
    var arrastra = false, movio = false, px = 0, py = 0, muestras = [], vx = 0, vy = 0, inercia = 0, t0 = 0, tileDown = null;
    var punteros = new Map();

    var parar = function () { if (inercia) { cancelAnimationFrame(inercia); inercia = 0; } };
    var correr = function () {
      vx *= 0.94;
      if (Math.abs(vx) < 0.08) { inercia = 0; return; }
      ox += vx; aplicar(); pedirTick();
      inercia = requestAnimationFrame(correr);
    };

    oyente(escena, 'pointerdown', function (e) {
      if (bloqueado || (e.pointerType === 'mouse' && e.button !== 0)) { return; }
      parar(); ocultarAyuda();
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { escena.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      arrastra = true; movio = false; px = e.clientX; py = e.clientY; muestras = [{ t: performance.now(), x: px, y: py }]; t0 = performance.now();
      tileDown = e.target.closest && e.target.closest('.campo-tile:not(.fuera)');
      campo.classList.add('arrastrando');
    });
    oyente(escena, 'pointermove', function (e) {
      var b = escena.getBoundingClientRect();
      ptr.x = e.clientX - b.left; ptr.y = e.clientY - b.top; ptr.dentro = e.pointerType === 'mouse';
      if (punteros.has(e.pointerId)) { punteros.set(e.pointerId, { x: e.clientX, y: e.clientY }); }
      if (arrastra) {
        var dx = e.clientX - px, dy = e.clientY - py;
        if (!movio && Math.hypot(e.clientX - muestras[0].x, e.clientY - muestras[0].y) > 5) { movio = true; }
        if (movio) {
          ox += dx + dy; aplicar();   // arrastrar en horizontal o en vertical mueve el campo siempre en horizontal
          var ahora = performance.now(); muestras.push({ t: ahora, x: e.clientX, y: e.clientY });
          while (muestras.length > 2 && ahora - muestras[0].t > 100) { muestras.shift(); }
        }
        px = e.clientX; py = e.clientY;
      }
      pedirTick();
    });
    var soltar = function (e) {
      punteros.delete(e.pointerId);
      if (!arrastra) { return; }
      arrastra = false; campo.classList.remove('arrastrando');
      if (!movio && performance.now() - t0 < 500 && tileDown && tileDown.dataset.i !== undefined) { entrar(parseInt(tileDown.dataset.i, 10), tileDown); return; }
      if (movio && !quieto && muestras.length > 1) {
        var a = muestras[0], b = muestras[muestras.length - 1], dt = Math.max(1, b.t - a.t);
        vx = ((b.x - a.x) + (b.y - a.y)) / dt * 16; vy = 0;
        if (Math.abs(vx) > 0.5) { inercia = requestAnimationFrame(correr); }
      }
    };
    oyente(escena, 'pointerup', soltar);
    oyente(escena, 'pointercancel', soltar);
    oyente(escena, 'pointerleave', function (e) { if (e.pointerType === 'mouse') { ptr.dentro = false; pedirTick(); } });

    oyente(escena, 'wheel', function (e) {
      if (bloqueado) { return; }
      e.preventDefault(); parar(); ocultarAyuda();
      var k = e.deltaMode === 1 ? 16 : 1, d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k;
      ox -= d; aplicar(); pedirTick();   // la rueda (vertical u horizontal) mueve el campo en horizontal
    }, { passive: false });

    oyente(document, 'keydown', function (e) {
      if (bloqueado || (cajon && cajon.classList.contains('abierto')) || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) { return; }
      var paso = 120, m = { ArrowLeft: paso, ArrowUp: paso, ArrowRight: -paso, ArrowDown: -paso }[e.key];
      if (m) { e.preventDefault(); ox += m; aplicar(); pedirTick(); }
    });

    var ocultarAyuda = function () { if (ayuda && !ayuda.hidden) { ayuda.classList.add('oculta'); } };
    if (ayuda) { ayuda.hidden = false; setTimeout(function () { if (ayuda) { ayuda.classList.add('oculta'); } }, 5200); }

    /* ───────── Teclado y lectores de pantalla: la lista de enlaces lleva el campo hasta cada proyecto ───────── */
    if (lista) {
      oyente(lista, 'focusin', function (e) {
        var a = e.target.closest('a[data-i]'); if (!a) { return; }
        centrarEn(parseInt(a.dataset.i, 10), true);
      });
    }

    /* ───────── Centrar una pieza (instantáneo o animado) ───────── */
    var cercanaA = function (i, x, y) {
      // de las celdas que repiten el proyecto i, la más próxima al punto (x,y)
      if (mapa) {                                             // con filtro cada proyecto está una sola vez: se busca su columna y su fila por posición
        var k = mapa.indexOf(i); if (k < 0) { return null; }
        var c1 = 0; while (cum(c1 + 1) <= k) { c1++; }
        return [c1, k - cum(c1)];
      }
      var gx = (x - ox) / escala, gy = (y - oy) / escala, cc = colEn(gx), mejor = null, dmin = Infinity;
      for (var c = cc - N; c <= cc + N; c++) {
        for (var r = 0; r < kCol(c); r++) {
          if (indice(c, r) !== i) { continue; }
          var ce = centroCelda(c, r), d = Math.hypot(ce[0] - gx, ce[1] - gy);
          if (d < dmin) { dmin = d; mejor = [c, r]; }
        }
      }
      return mejor;
    };
    var origenPara = function (c, r) { var ce = centroCelda(c, r); return [W / 2 - ce[0] * escala, OY]; };   // solo se centra en horizontal; la fila no se mueve
    function centrarEn(i, animado) {
      var cr = cercanaA(i, W / 2, H / 2); if (!cr) { return; }
      var o = origenPara(cr[0], cr[1]);
      if (animado && !quieto) { rejilla.style.transition = 'transform 500ms ' + EASE; document.body.style.transition = 'background-position 500ms ' + EASE; ox = o[0]; oy = o[1]; aplicar(); setTimeout(function () { rejilla.style.transition = ''; document.body.style.transition = ''; pedirTick(); }, 520); }
      else { ox = o[0]; oy = o[1]; aplicar(); }
      pedirTick();
    }

    /* ───────── Entrar a un proyecto: se centra, el resto se desvanece y la imagen vuela a la ficha ───────── */
    var entrar = function (i, tileEl) {
      if (bloqueado) { return; }
      bloqueado = true; parar();
      var p = datos[i];
      if (VTB.prefetch) { VTB.prefetch(p.url); }                          // la página se pide mientras la escena se prepara
      var t = null; tiles.forEach(function (x) { if (x.el === tileEl) { t = x; } });
      if (!t) { t = tiles.get(celdaCercana(W / 2, H / 2).join(',')); }
      t.el.classList.add('elegida'); campo.classList.add('saliendo');
      var dur = quieto ? 0 : 600, o = origenPara(t.c, t.r);
      if (dur) { rejilla.style.transition = 'transform ' + dur + 'ms ' + EASE; }
      ox = o[0]; oy = o[1]; aplicar();
      setTimeout(function () {
        rejilla.style.transition = '';
        var r = t.img.getBoundingClientRect();
        vistaGuardada = { ox: ox, oy: oy, escala: escala };
        VTB.navegar(p.url, { origen: { rect: { left: r.left, top: r.top, width: r.width, height: r.height }, src: p.grande || p.mini, desdeObjeto: t.el.classList.contains('es-objeto'), srcObjeto: t.el.classList.contains('es-objeto') ? (p.objeto || '') : ((VTB.fotoElegida && VTB.fotoElegida[p.id]) ? VTB.fotoElegida[p.id].src : '') } });
      }, dur + (quieto ? 0 : 60));
    };

    /* ───────── API para el router (volver desde una ficha) ───────── */
    VTB.campo = {
      rectDe: function (id) {
        var mejor = null, dmin = Infinity;
        tiles.forEach(function (t) {
          if (datos[t.i].id !== id) { return; }
          var r = t.img.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - W / 2, r.top + r.height / 2 - H / 2);
          if (d < dmin) { dmin = d; mejor = t; }
        });
        return mejor ? { rect: mejor.img.getBoundingClientRect(), img: mejor.img } : null;
      },
    };



    /* ───────── Interruptor Objetos / Foto principal ───────── */
    var btnModo = campo.querySelector('[data-modo]');
    var pintarModo = function () {
      if (!btnModo) { return; }
      btnModo.setAttribute('aria-checked', modoObjeto ? 'true' : 'false');
      var rot = btnModo.querySelector('.campo-modo-t'); if (rot) { rot.textContent = modoObjeto ? 'Objetos' : 'Imagen'; }   // la palabra nombra lo que se muestra
    };
    // fotos ↔ objetos: fundido cruzado. Una copia de la imagen anterior queda encima y se desvanece mientras la nueva aparece debajo.
    // Sólo cambian las piezas que tienen objeto; el resto no se toca.
    var DUR_FUNDIDO = 480;
    var fundir = function (t) {
      var tok = t.tok = (t.tok || 0) + 1;
      if (t.fantasma) {                                   // interrumpido: se deshace el fundido en curso y la pieza queda en su estado final
        t.fantasma.remove(); t.fantasma = null; t.img.getAnimations().forEach(function (a) { a.cancel(); });
        t.img.style.opacity = ''; t.img.style.transition = '';
        ponerImagen(t.el, t.img, datos[t.i]); return;
      }
      var op = parseFloat(getComputedStyle(t.img).opacity) || 1;
      var fantasma = t.img.cloneNode(false);              // copia exacta de la imagen actual (misma fuente y tamaño)
      fantasma.decoding = 'sync';                         // se pinta en el mismo cuadro: si no, un instante se vería el contenido nuevo y luego volvería el viejo
      fantasma.style.gridArea = '1 / 1'; fantasma.setAttribute('aria-hidden', 'true');
      t.img.style.gridArea = '1 / 1';
      t.el.appendChild(fantasma); t.fantasma = fantasma;
      t.img.style.transition = 'none'; t.img.style.opacity = '0';   // la real nace invisible (sin transición CSS) hasta que arranque su fundido
      ponerImagen(t.el, t.img, datos[t.i]);               // la imagen real pasa al nuevo contenido
      var listo = t.img.decode ? t.img.decode().catch(function () {}) : Promise.resolve();
      listo.then(function () {
        if (t.tok !== tok) { return; }
        var opt = { duration: DUR_FUNDIDO, delay: (t.i % 6) * 22, easing: 'ease-in-out', fill: 'backwards' };
        var ar = t.img.animate([{ opacity: 0 }, { opacity: op }], Object.assign({}, opt, { fill: 'both' }));
        ar.onfinish = function () {                       // devolver el control a la hoja de estilos sin que salte ni se anime
          if (t.tok !== tok) { return; }
          t.img.style.opacity = ''; void t.img.offsetWidth; t.img.style.transition = '';
        };
        var a = fantasma.animate([{ opacity: op }, { opacity: 0 }], Object.assign({}, opt, { fill: 'forwards' }));
        a.onfinish = function () { if (t.fantasma === fantasma) { fantasma.remove(); t.fantasma = null; } };
      });
    };
    var cambiarModo = function (valor) {
      if (modoObjeto === valor) { return; }
      modoObjeto = valor; pintarModo();
      tiles.forEach(function (t) {
        if (quieto || !datos[t.i].objeto) { ponerImagen(t.el, t.img, datos[t.i]); } else { fundir(t); }
      });
    };
    if (btnModo) {
      pintarModo();
      oyente(btnModo, 'click', function () { clearTimeout(tLlegada); cambiarModo(!modoObjeto); });
    }
    // «Proyectos» del menú llega con ?modo=fotos: el campo abre con las fotos y, tras una pausa, el interruptor se enciende solo para que se vea el cambio
    var tLlegada = 0;
    var tipParam = (/[?&]filtro=([^&#]+)/.exec(location.search) || [])[1];
    tipParam = tipParam ? decodeURIComponent(tipParam) : '';
    if (tipParam) {
      // una tipología del menú: el campo abre con las fotos, sin encender los objetos, y con ese filtro activo
      modoObjeto = false; pintarModo();
    } else if (/[?&]modo=fotos\b/.test(location.search)) {
      modoObjeto = false; pintarModo();
      tLlegada = setTimeout(function () { cambiarModo(true); }, quieto ? 0 : 1500);
      limpiezas.push(function () { clearTimeout(tLlegada); });
    }

    /* ───────── Filtro: botón arriba a la derecha + cajón lateral. Sólo se muestran los proyectos elegidos ───────── */
    var btnFiltro = campo.querySelector('[data-filtro-abrir]'), cajon = campo.querySelector('[data-cajon]'), fondo = campo.querySelector('[data-cajon-fondo]');
    var filtroN = campo.querySelector('[data-filtro-n]'), filtroCuenta = campo.querySelector('[data-filtro-cuenta]'), filtroVacio = campo.querySelector('[data-filtro-vacio]');
    var pildoras = [].slice.call(campo.querySelectorAll('.filtro[data-grupo]'));
    var coincide = function (p, f) {
      return (!f.tip.length || p.tip.some(function (t) { return f.tip.indexOf(t) > -1; })) && (!f.pais.length || f.pais.indexOf(p.pais) > -1) && (!f.ctx.length || (p.ctx || []).some(function (t) { return f.ctx.indexOf(t) > -1; }));
    };
    var pintarPildoras = function () {
      pildoras.forEach(function (b) { b.setAttribute('aria-pressed', filtroGuardado[b.dataset.grupo].indexOf(b.dataset.valor) > -1 ? 'true' : 'false'); });
      var activos = filtroGuardado.tip.length + filtroGuardado.pais.length + filtroGuardado.ctx.length;
      if (filtroN) { filtroN.hidden = !activos; filtroN.textContent = String(activos); }
      var cuantos = todos.filter(function (p) { return coincide(p, filtroGuardado); }).length;
      if (filtroCuenta) { filtroCuenta.textContent = String(cuantos); }
      if (filtroVacio) { filtroVacio.hidden = cuantos > 0; }
      return cuantos;
    };
    var hayFiltro = function () { return filtroGuardado.tip.length + filtroGuardado.pais.length + filtroGuardado.ctx.length > 0; };
    // los proyectos que no cumplen el filtro siguen en el campo, muy tenues y sin poder entrar a ellos
    var marcarTile = function (t) { t.el.classList.toggle('fuera', hayFiltro() && !coincide(datos[t.i], filtroGuardado)); };
    // con un filtro activo el campo se reduce a los resultados: se agrupan en el centro y el resto desaparece (sin filtro, vuelve el campo completo)
    var reconstruirMapa = function () {
      mapa = null;
      if (!hayFiltro()) { return; }
      var m = []; datos.forEach(function (p, i) { if (coincide(p, filtroGuardado)) { m.push(i); } });
      if (m.length) { mapa = m; }                      // sin resultados se deja el campo completo (el cajón ya lo avisa)
    };
    var centrarGrupo = function () {
      var cols = 1; while (cum(cols) < mapa.length) { cols++; }          // columnas que ocupan los resultados
      ox = W / 2 - (X(cols) / 2) * escala; oy = OY; aplicar();
    };
    var tReagrupa = 0;
    var cambiarFiltro = function () {
      pintarPildoras();
      clearTimeout(tReagrupa);
      var rehacer = function () {
        tiles.forEach(function (t) { if (!t.el.classList.contains('elegida')) { t.el.remove(); } }); tiles.clear();
        if (focoActual) { focoActual = null; }
        reconstruirMapa();
        if (mapa) { centrarGrupo(); } else { var c = origenPara(3, 0); ox = c[0]; oy = OY; aplicar(); }
        sincronizar();
        if (!quieto) {                                   // las nuevas aparecen desde el centro hacia afuera
          tiles.forEach(function (t) {
            var r = t.el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - W / 2, r.top + r.height / 2 - (H / 2 + escena.getBoundingClientRect().top));
            t.img.style.transitionDelay = Math.min(500, d * 0.5) + 'ms';
          });
        }
        void campo.offsetWidth; campo.classList.remove('reagrupando');
        setTimeout(function () { tiles.forEach(function (t) { t.img.style.transitionDelay = ''; }); }, 1200);
        pedirTick(); actualizarFoco();
      };
      if (quieto) { rehacer(); return; }
      campo.classList.add('reagrupando');                // los actuales se desvanecen y luego entra el grupo nuevo
      tReagrupa = setTimeout(rehacer, 280);
    };
    // llegada desde el menú: «Proyectos» limpia el filtro; una tipología lo deja con esa tipología
    if (tipParam || /[?&]modo=fotos\b/.test(location.search) || VTB.reiniciarFiltro) {
      VTB.reiniciarFiltro = false;
      filtroGuardado = { tip: [], pais: [], ctx: [] };
      if (tipParam && pildoras.some(function (p) { return p.dataset.grupo === 'tip' && p.dataset.valor === tipParam; })) { filtroGuardado.tip = [tipParam]; }
    }
    pildoras.forEach(function (b) {
      oyente(b, 'click', function () {
        // un solo filtro a la vez: elegir uno reemplaza al anterior (sea tipología o país); volver a pulsarlo lo quita
        var activo = filtroGuardado[b.dataset.grupo].indexOf(b.dataset.valor) > -1;
        filtroGuardado = { tip: [], pais: [], ctx: [] };
        if (!activo) { filtroGuardado[b.dataset.grupo] = [b.dataset.valor]; }
        cambiarFiltro();
      });
    });
    var limpiar = campo.querySelector('[data-filtro-limpiar]');
    if (limpiar) { oyente(limpiar, 'click', function () { filtroGuardado = { tip: [], pais: [], ctx: [] }; cambiarFiltro(); }); }
    var abrirCajon = function () {
      cajon.hidden = false; fondo.hidden = false; btnFiltro.setAttribute('aria-expanded', 'true');
      void cajon.offsetWidth;                          // fija el estado cerrado antes de animar la apertura
      cajon.classList.add('abierto'); fondo.classList.add('abierto');
      var p = cajon.querySelector('.filtro, button'); if (p) { p.focus({ preventScroll: true }); }
    };
    var cerrarCajon = function () {
      cajon.classList.remove('abierto'); fondo.classList.remove('abierto'); btnFiltro.setAttribute('aria-expanded', 'false');
      setTimeout(function () { if (!cajon.classList.contains('abierto')) { cajon.hidden = true; fondo.hidden = true; } }, quieto ? 0 : 320);
      btnFiltro.focus({ preventScroll: true });
    };
    if (btnFiltro && cajon) {
      oyente(btnFiltro, 'click', function () { if (cajon.classList.contains('abierto')) { cerrarCajon(); } else { abrirCajon(); } });
      oyente(fondo, 'click', cerrarCajon);
      oyente(cajon.querySelector('[data-cajon-cerrar]'), 'click', cerrarCajon);
      oyente(document, 'keydown', function (e) { if (e.key === 'Escape' && cajon.classList.contains('abierto')) { e.stopPropagation(); cerrarCajon(); } }, true);
    }

    /* ───────── Arranque ───────── */
    medir();
    var volverA = VTB.volverA; VTB.volverA = null;
    if (tipParam) { vistaGuardada = null; }                  // llegar por una tipología reinicia la vista: se vuelve a centrar
    var volverMatch = volverA && todos.some(function (p) { return p.id === volverA && coincide(p, filtroGuardado); });
    pintarPildoras();
    reconstruirMapa();
    if (vistaGuardada) { escala = vistaGuardada.escala; }
    STEP = pasoPara(escala);                            // el paso depende del zoom: va antes de calcular cualquier origen
    if (vistaGuardada) { ox = vistaGuardada.ox; oy = OY; }
    else { var c = origenPara(3, 0); ox = c[0]; oy = OY; }
    if (volverA && (!tipParam || volverMatch)) {
      var idx = datos.findIndex(function (p) { return p.id === volverA; });
      if (idx > -1) { centrarEn(idx, false); }
    }
    // con un filtro de entrada (o guardado), los resultados quedan agrupados en el centro, salvo al volver de una ficha de uno de ellos
    if (mapa && !volverMatch) { centrarGrupo(); }
    aplicar(); pintarZoom(); sincronizar(); actualizarFoco();

    if (!vistaGuardada || !volverA) {
      if (!quieto) {
        // aparición: las piezas surgen desde el centro hacia afuera
        campo.classList.add('intro');
        tiles.forEach(function (t) {
          var r = t.el.getBoundingClientRect(), d = Math.hypot(r.left + r.width / 2 - (W / 2), r.top + r.height / 2 - (H / 2 + escena.getBoundingClientRect().top));
          t.img.style.transitionDelay = Math.min(900, d * 0.9) + 'ms';
        });
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          campo.classList.remove('intro');
          setTimeout(function () { tiles.forEach(function (t) { t.img.style.transitionDelay = ''; }); }, 1900);
        }); });
      }
    }

    oyente(window, 'resize', function () { medir(); aplicar(); pedirTick(); });
    limpiezas.push(function () { document.body.style.backgroundPosition = ''; document.body.style.transition = ''; parar(); if (raf) { cancelAnimationFrame(raf); } VTB.campo = null; });
    return function () {
      vistaGuardada = { ox: ox, oy: oy, escala: escala };
      limpiezas.forEach(function (f) { f(); });
    };
  });
})();
