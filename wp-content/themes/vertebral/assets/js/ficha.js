/* Vertebral · ficha de proyecto: deslizador (regla de marcas, imagen central y vecinas desenfocadas) y
 * marca de «visto». Se monta con cada <main> nuevo que trae el router y devuelve su limpieza. */
(function () {
  'use strict';
  var VTB = window.VTB;
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LOCK_MS = 620;   // la misma duración que la transición CSS de las vecinas (--pv-dur: 600ms) + un respiro

  /* ───────── Deslizador reutilizable: imagen central, vecinas escaladas y desenfocadas; rueda, teclado, dedo y arrastre ─────────
   * pv: raíz (recibe .arrastrando/.sin-transicion) · escena: zona de arrastre · slides: figuras .xx-slide
   * o.alCambiar(actual) · o.tecladoActivo() → si las flechas deben actuar · o.inicio: índice de partida */
  function deslizador(pv, escena, slides, o) {
    o = o || {};
    var limp = [];
    var oyente = function (obj, ev, fn, op) { obj.addEventListener(ev, fn, op); limp.push(function () { obj.removeEventListener(ev, fn, op); }); };
    var n = slides.length, actual = Math.max(0, Math.min(n - 1, o.inicio || 0)), bloqueado = false, tBloqueo = 0;

    var pintar = function () {
      slides.forEach(function (s, i) {
        var d = i - actual;
        var est = d < -2 ? '-x' : d > 2 ? 'x' : String(d);
        var lejos = est === 'x' || est === '-x';
        // con cientos de slides sólo se toca el DOM de los que cambian de estado (y las lejanas ni se maquetan)
        if (s.dataset.d === est) { return; }
        var activo = d === 0;
        s.dataset.d = est;
        if (!activo && s.contains(document.activeElement)) { document.activeElement.blur(); }
        if (activo) { s.removeAttribute('inert'); s.removeAttribute('aria-hidden'); } else { s.setAttribute('inert', ''); s.setAttribute('aria-hidden', 'true'); }
        if (!lejos) { var im = s.querySelector('img'); if (im && im.loading === 'lazy') { im.loading = 'eager'; } }  // precarga ±2
      });
      pv.style.setProperty('--x', ((actual + 0.5) / n).toFixed(4));
      if (o.alCambiar) { o.alCambiar(actual); }
    };
    var ir = function (i) {
      i = Math.max(0, Math.min(n - 1, i));
      if (i === actual || bloqueado) { return; }
      actual = i; pintar();
      bloqueado = true; clearTimeout(tBloqueo); tBloqueo = setTimeout(function () { bloqueado = false; }, quieto ? 0 : LOCK_MS);
    };
    pv.classList.add('sin-transicion');
    pintar();
    requestAnimationFrame(function () { requestAnimationFrame(function () { pv.classList.remove('sin-transicion'); }); });
    limp.push(function () { clearTimeout(tBloqueo); clearTimeout(tSuelta); });

    oyente(pv, 'click', function (e) {
      var b = e.target.closest('[data-pv], [data-ir]');
      if (!b || !pv.contains(b)) { return; }
      if (b.dataset.ir !== undefined) { ir(parseInt(b.dataset.ir, 10)); }
      else { ir(actual + (b.dataset.pv === 'siguiente' ? 1 : -1)); }
    });

    // rueda: solo el desplazamiento horizontal cambia de imagen; el vertical sigue siendo de la página
    oyente(pv, 'wheel', function (e) {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Math.abs(e.deltaX) < 18) { return; }
      e.preventDefault();
      ir(actual + (e.deltaX > 0 ? 1 : -1));
    }, { passive: false });

    // teclado
    oyente(document, 'keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') { return; }
      var t = e.target; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { return; }
      if (o.tecladoActivo && !o.tecladoActivo()) { return; }
      ir(actual + (e.key === 'ArrowRight' ? 1 : -1));
    });

    // deslizar con el dedo
    var x0 = 0, y0 = 0, t0 = 0;
    oyente(pv, 'touchstart', function (e) { var t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now(); }, { passive: true });
    oyente(pv, 'touchend', function (e) {
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3 && Date.now() - t0 < 700) { ir(actual + (dx < 0 ? 1 : -1)); }
    }, { passive: true });

    // arrastrar con el ratón: las imágenes siguen al puntero y su escala, desenfoque y opacidad se interpolan en vivo
    var ES = [1, .75, .6, .5], EO = [1, .35, 0, 0], EB = [0, 10, 14, 14];
    var mezcla = function (a, d) { var k = Math.min(Math.abs(d), 3), i = Math.floor(k), f = k - i; return a[i] + ((a[Math.min(i + 1, 3)]) - a[i]) * f; };
    var arr = null, movido = false;
    var pintarArrastre = function (dx) {
      var t = dx / (innerWidth * 0.5);
      if ((actual === 0 && t > 0) || (actual === n - 1 && t < 0)) { t *= 0.3; }   // goma en los extremos
      // sólo las cercanas (con cientos de slides recorrerlas todas en cada movimiento era lo que hacía lag)
      for (var i = Math.max(0, actual - 3); i <= Math.min(n - 1, actual + 3); i++) {
        var s = slides[i], d = i - actual + t;
        s.style.setProperty('--d', d.toFixed(3)); s.style.setProperty('--s', mezcla(ES, d).toFixed(3));
        s.style.setProperty('--o', mezcla(EO, d).toFixed(3));
      }
    };
    var rafArr = 0, dxArr = 0, tSuelta = 0;
    var pintarArrastreRaf = function (dx) { dxArr = dx; if (!rafArr) { rafArr = requestAnimationFrame(function () { rafArr = 0; pintarArrastre(dxArr); }); } };
    var soltar = function (dx) {
      pv.classList.remove('arrastrando');
      pv.classList.add('suelta'); clearTimeout(tSuelta); tSuelta = setTimeout(function () { pv.classList.remove('suelta'); }, 420);   // al soltar, continúa desde donde está: más corto y sin arranque lento
      if (rafArr) { cancelAnimationFrame(rafArr); rafArr = 0; }
      for (var i = Math.max(0, actual - 3); i <= Math.min(n - 1, actual + 3); i++) { ['--d', '--s', '--o'].forEach(function (v) { slides[i].style.removeProperty(v); }); }
      if (Math.abs(dx) > Math.min(110, innerWidth * 0.12)) { ir(actual + (dx < 0 ? 1 : -1)); }
    };
    oyente(escena, 'dragstart', function (e) { e.preventDefault(); });   // el enlace/imagen no se arrastra como archivo
    oyente(escena, 'pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || n < 2 || bloqueado) { return; }
      arr = { x: e.clientX, id: e.pointerId, dx: 0 }; movido = false;
    });
    oyente(window, 'pointermove', function (e) {
      if (!arr || e.pointerId !== arr.id) { return; }
      arr.dx = e.clientX - arr.x;
      if (!movido && Math.abs(arr.dx) > 6) { movido = true; pv.classList.add('arrastrando'); try { escena.setPointerCapture(arr.id); } catch (_) {} }
      if (movido) { pintarArrastreRaf(arr.dx); }
    });
    var fin = function (e) {
      if (!arr || e.pointerId !== arr.id) { return; }
      var dx = arr.dx, vino = movido; arr = null;
      if (vino) { soltar(dx); }
    };
    oyente(window, 'pointerup', fin); oyente(window, 'pointercancel', fin);
    // un arrastre no debe contar como clic (cambiaría de imagen)
    oyente(pv, 'click', function (e) { if (movido) { e.stopPropagation(); e.preventDefault(); movido = false; } }, true);

    return { destruir: function () { limp.forEach(function (f) { f(); }); limp = []; }, ir: ir };
  }

  VTB.montar.push(function (raiz) {
    var ficha = raiz.querySelector('.ficha');
    if (!ficha) { return; }
    var limpiezas = [];
    var oyente = function (obj, ev, fn, op) { obj.addEventListener(ev, fn, op); limpiezas.push(function () { obj.removeEventListener(ev, fn, op); }); };

    /* ───────── Deslizador del héroe ───────── */
    var pv = ficha.querySelector('[data-pv]');
    if (pv) {
      var ant = pv.querySelector('[data-ant]');
      if (ant) { oyente(ant, 'click', function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); }); }
      var sig = pv.querySelector('[data-sig]');
      if (sig) { oyente(sig, 'click', function () { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); }); }
      var flecha = pv.querySelector('[data-scroll-abajo]');
      if (flecha) { oyente(flecha, 'click', function () { var r = pv.getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.bottom - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-alto')) || 0), behavior: quieto ? 'auto' : 'smooth' }); }); }
      // la ficha (símbolo + texto) aparece cuando la imagen del primer slide ya está completamente visible: sin vuelo ni transiciones en curso y decodificada
      var fichaTok = 0;
      var revisarCarta = function () {
        var tok = ++fichaTok, s0 = pv.querySelector('.pv-slide[data-i="0"]');
        if (!s0 || s0.dataset.d !== '0') { pv.classList.remove('carta-lista'); return; }
        var im = s0.querySelector('img');
        if (pv.classList.contains('preparando') || (im && !im.complete)) { return; }   // se reintenta al terminar el vuelo / cargar la imagen
        var an = s0.getAnimations({ subtree: true }).map(function (x) { return x.finished.catch(function () {}); });
        Promise.all(an).then(function () { if (tok === fichaTok && s0.dataset.d === '0') { requestAnimationFrame(function () { if (tok === fichaTok) { pv.classList.add('carta-lista'); } }); } });
      };
      var dsPv = deslizador(pv, pv.querySelector('[data-escena]') || pv, [].slice.call(pv.querySelectorAll('.pv-slide')), {
        alCambiar: function (a) { pv.classList.toggle('en-primero', a === 0); revisarCarta(); },   // la ficha técnica solo vive en el primer slide
        tecladoActivo: function () {
          if (document.body.classList.contains('galeria-abierta')) { return false; }
          var r = pv.getBoundingClientRect();
          return !(r.bottom < innerHeight * 0.3 || r.top > innerHeight * 0.7);
        }
      });
      limpiezas.push(dsPv.destruir);
      var im0 = pv.querySelector('.pv-slide[data-i="0"] img');
      if (im0) { oyente(im0, 'load', revisarCarta); }
      var prepPrev = pv.classList.contains('preparando');
      var moC = new MutationObserver(function () { var p = pv.classList.contains('preparando'); if (p !== prepPrev) { prepPrev = p; revisarCarta(); } }); moC.observe(pv, { attributes: true, attributeFilter: ['class'] });   // fin del vuelo (.preparando se quita)
      limpiezas.push(function () { moC.disconnect(); fichaTok++; });
      revisarCarta();
    }

    /* ───────── Galería a pantalla completa (secciones con pestañas): mismo deslizador que el héroe ───────── */
    var galeria = null;
    var cerrarGaleria = function (devolverFoco) {
      if (!galeria) { return; }
      var g = galeria; galeria = null;
      g.ds.destruir(); g.quitarEsc();
      document.body.classList.remove('galeria-abierta');
      g.el.classList.remove('visible');
      setTimeout(function () { g.el.remove(); }, quieto ? 0 : 320);
      if (devolverFoco !== false && g.disparador && document.contains(g.disparador)) { g.disparador.focus({ preventScroll: true }); }
    };
    var abrirGaleria = function (marco) {
      var sec = marco.closest('section'); if (!sec || galeria) { return; }
      var marcos = [].slice.call(sec.querySelectorAll('.marco-img[data-full]'));
      var inicio = marcos.indexOf(marco); if (inicio < 0) { return; }
      var h = sec.querySelector('.rotulo'), titulo = h && h.firstChild ? h.firstChild.textContent.trim() : '';
      var el = document.createElement('div');
      el.className = 'go'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', titulo || 'Galería');
      var cab = document.createElement('div'); cab.className = 'go-cab';
      var tit = document.createElement('span'); tit.className = 'go-titulo'; tit.textContent = titulo;
      var cta = document.createElement('span'); cta.className = 'go-cuenta'; cta.setAttribute('aria-live', 'polite');
      var cer = document.createElement('button'); cer.type = 'button'; cer.className = 'etq go-cerrar'; cer.textContent = 'Cerrar';
      cab.appendChild(tit); cab.appendChild(cta); cab.appendChild(cer);
      var esc = document.createElement('div'); esc.className = 'go-escena';
      var slides = marcos.map(function (m, i) {
        var f = document.createElement('figure'); f.className = 'go-slide'; f.dataset.i = i;
        var im = document.createElement('img'), orig = m.querySelector('img');
        im.src = m.dataset.full; im.alt = orig ? orig.alt : ''; im.loading = Math.abs(i - inicio) <= 2 ? 'eager' : 'lazy'; im.decoding = 'async'; im.draggable = false;
        f.appendChild(im); esc.appendChild(f); return f;
      });
      if (marcos.length > 1) {
        [['prev', 'anterior', 'Imagen anterior'], ['sig', 'siguiente', 'Imagen siguiente']].forEach(function (z) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'pv-zona pv-zona-' + z[0]; b.dataset.pv = z[1]; b.setAttribute('aria-label', z[2]); esc.appendChild(b);
        });
      }
      var pie = document.createElement('p'); pie.className = 'go-pie';
      el.appendChild(cab); el.appendChild(esc); el.appendChild(pie);
      document.body.appendChild(el);
      document.body.classList.add('galeria-abierta');
      var ds = deslizador(el, esc, slides, {
        inicio: inicio,
        alCambiar: function (a) { cta.textContent = (a + 1) + ' / ' + slides.length; pie.textContent = marcos[a].dataset.desc || ''; },
        tecladoActivo: function () { return true; }
      });
      var teclas = function (e) { if (e.key === 'Escape') { e.stopPropagation(); cerrarGaleria(); } };
      document.addEventListener('keydown', teclas, true);
      galeria = { el: el, ds: ds, disparador: marco, quitarEsc: function () { document.removeEventListener('keydown', teclas, true); } };
      cer.addEventListener('click', function () { cerrarGaleria(); });
      requestAnimationFrame(function () { el.classList.add('visible'); cer.focus({ preventScroll: true }); });
    };
    oyente(ficha, 'click', function (e) {
      var m = e.target.closest('.ficha-doc .marco-img[data-full]'); if (m) { abrirGaleria(m); }
    });
    oyente(ficha, 'keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') { return; }
      var m = e.target.closest && e.target.closest('.ficha-doc .marco-img[data-full]');
      if (m && e.target === m) { e.preventDefault(); abrirGaleria(m); }
    });
    limpiezas.push(function () { cerrarGaleria(false); });

    /* ───────── Movimiento ligado al scroll: parallax del héroe y de las fotos del relato, y entradas ───────── */
    ficha.setAttribute('data-anim', '');
    limpiezas.push(function () { ficha.removeAttribute('data-anim'); });

    // título: cada palabra entra desde su máscara en cuanto el deslizador queda a la vista (tras el vuelo, si lo hay)
    if (pv) {
      var arrancar = function () {
        if (pv.classList.contains('preparando')) { return false; }
        requestAnimationFrame(function () { pv.classList.add('lista'); });
        var tv = setTimeout(function () { pv.classList.add('vecinas-ya'); }, 1600);   // las imágenes que siguen ya entraron: desde aquí el deslizador se comporta normal
        limpiezas.push(function () { clearTimeout(tv); });
        return true;
      };
      if (!arrancar()) {
        var mo = new MutationObserver(function () { if (arrancar()) { mo.disconnect(); } });
        mo.observe(pv, { attributes: true, attributeFilter: ['class'] });
        limpiezas.push(function () { mo.disconnect(); });
      }
    }

    // entradas: párrafos y datos con fundido y ascenso; fotos con una máscara que se abre. Una sola vez por elemento.
    // las fotos se observan por su contenedor: un marco recortado por clip-path no registra intersección
    var revelables = [].slice.call(ficha.querySelectorAll('[data-rev], .relato-medio'));
    var abrir = function (el) { el.classList.add('dentro'); [].forEach.call(el.querySelectorAll('.relato-marco'), function (m) { m.classList.add('dentro'); }); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { abrir(e.target); io.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -14% 0px', threshold: 0.04 });
      revelables.forEach(function (el) { io.observe(el); });
      limpiezas.push(function () { io.disconnect(); });
    } else { revelables.forEach(abrir); }

    // parallax: el contenido del héroe se desplaza más lento que el scroll; cada foto del relato se mueve dentro de su marco
    // y la segunda columna de un par deriva a otra velocidad. Solo se calcula lo que está a la vista.
    var escenaPv = pv && pv.querySelector('.pv-escena');
    var marcos = [].slice.call(ficha.querySelectorAll('.relato-marco'));
    if (!quieto) {
      var tickP = 0;
      var parallax = function () {
        tickP = 0;
        var vh = window.innerHeight;
        ficha.classList.toggle('scrolleado', window.scrollY > 40);
        if (pv && escenaPv) {
          var rp = pv.getBoundingClientRect();
          if (rp.bottom > 0) { var prog = Math.max(0, Math.min(1, -rp.top / rp.height)); escenaPv.style.setProperty('--py', (prog * rp.height * 0.22).toFixed(1) + 'px'); }
        }
        marcos.forEach(function (m) {
          var r = m.getBoundingClientRect();
          if (r.bottom < -120 || r.top > vh + 120) { return; }
          var p = ((r.top + r.height / 2) - vh / 2) / (vh / 2 + r.height / 2);       // -1 al entrar por abajo … 1 al salir por arriba
          var im = m.querySelector('.relato-img');
          if (im) { im.style.transform = 'translate3d(0,' + (-p * r.height * 0.1).toFixed(1) + 'px,0)'; }
          if (m.classList.contains('marco-b')) { m.style.setProperty('--dy', (-p * vh * 0.07).toFixed(1) + 'px'); }
        });
      };
      var pedirP = function () { if (!tickP) { tickP = requestAnimationFrame(parallax); } };
      oyente(window, 'scroll', pedirP, { passive: true });
      oyente(window, 'resize', pedirP);
      limpiezas.push(function () { if (tickP) { cancelAnimationFrame(tickP); } });
      parallax();
    } else { ficha.classList.toggle('scrolleado', false); }

    /* ───────── Proceso: 12 a la vista y «Ver todas» ───────── */
    var proc = ficha.querySelector('[data-proceso]');
    if (proc) {
      var rej = proc.querySelector('.proceso-rejilla'), mas = proc.querySelector('[data-proceso-mas]');
      rej.classList.add('con-js');
      if (mas) {
        oyente(mas, 'click', function () {
          var abierta = rej.classList.toggle('abierta');
          mas.setAttribute('aria-expanded', abierta ? 'true' : 'false');
          mas.textContent = abierta ? mas.dataset.tCerrar : mas.dataset.tAbrir;
          if (!abierta) { rej.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' }); }
        });
      }
    }

    /* ───────── Documentación: renders, planos, modelos, proceso y obra juntos, en pestañas ───────── */
    var doc = ficha.querySelector('[data-doc]');
    var paneles = doc ? [].slice.call(doc.children).filter(function (el) { return el.matches('section'); }) : [];
    if (doc && paneles.length > 1) {
      var nav = document.createElement('div');
      nav.className = 'doc-tabs'; nav.setAttribute('role', 'tablist'); nav.setAttribute('aria-label', 'Documentación del proyecto');
      var botones = paneles.map(function (pn, i) {
        var h = pn.querySelector('.rotulo'), n = h && h.querySelector('.rotulo-n');
        var nombre = h ? h.textContent.replace(n ? n.textContent : '', '').trim() : 'Sección ' + (i + 1);
        var cuenta = n ? n.textContent.trim() : (pn.querySelectorAll('.plano').length || '');
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'doc-tab'; b.setAttribute('role', 'tab');
        b.innerHTML = '<span></span>' + (cuenta ? ' <i></i>' : '');
        b.firstChild.textContent = nombre; if (cuenta) { b.lastChild.textContent = cuenta; }
        if (!pn.id) { pn.id = 'doc-panel-' + i; }
        b.setAttribute('aria-controls', pn.id);
        pn.setAttribute('role', 'tabpanel');
        nav.appendChild(b); return b;
      });
      doc.classList.add('con-js'); doc.insertBefore(nav, doc.firstChild);
      var activar = function (k, foco) {
        paneles.forEach(function (pn, i) { pn.hidden = i !== k; });
        botones.forEach(function (b, i) { b.setAttribute('aria-selected', i === k ? 'true' : 'false'); b.tabIndex = i === k ? 0 : -1; });
        if (foco) { botones[k].focus(); }
        window.dispatchEvent(new Event('scroll'));          // las disoluciones por scroll recalculan con el panel ya visible
      };
      botones.forEach(function (b, i) {
        oyente(b, 'click', function () { activar(i); });
        oyente(b, 'keydown', function (e) {
          var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (d) { e.preventDefault(); activar((i + d + botones.length) % botones.length, true); }
        });
      });
      activar(0);
    }

    /* ───────── «Visto»: las muestras ya manipuladas lucen gastadas ───────── */
    try {
      var clave = 'vertebral-vistos', vistos = JSON.parse(localStorage.getItem(clave) || '[]');
      var id = ficha.dataset.proyecto;
      ficha.querySelectorAll('.tarjeta[data-proyecto]').forEach(function (t) { if (vistos.indexOf(t.dataset.proyecto) > -1) { t.classList.add('visto'); } });
      if (vistos.indexOf(id) === -1) { vistos.push(id); localStorage.setItem(clave, JSON.stringify(vistos)); }
    } catch (err) { /* almacenamiento bloqueado: la ficha funciona igual */ }

    return function () { limpiezas.forEach(function (f) { f(); }); };
  });

  /* Imagen activa del deslizador: origen/destino de la transición entre vistas */
  VTB.vistas.imagenActiva = function (raiz) { return raiz.querySelector('.pv .pv-slide[data-d="0"] img'); };
})();
