/* Vertebral · navegación sin cortes con el DOM.
 * Los enlaces internos no recargan la página: se pide el HTML de destino, se sustituye solo el <main> y la imagen clave
 * (miniatura del campo, tarjeta del listado, imagen del deslizador) vuela de su posición a la nueva con una animación
 * continua. El botón «atrás» deshace el viaje (vuelve volando a su miniatura). Si algo falla, se navega de forma normal. */
(function () {
  'use strict';
  var VTB = window.VTB;
  var quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';
  var VUELO_MS = 700;
  // prefijo de la ruta cuando el sitio cuelga de una subcarpeta (staging estático en GitHub Pages); vacío en el sitio normal
  var BASE = (document.documentElement.getAttribute('data-base') || '').replace(/\/$/, '');
  var rp = function (p) { return BASE && p.indexOf(BASE) === 0 ? (p.slice(BASE.length) || '/') : p; };

  var cache = new Map(), limpiezas = [], navegando = false;
  var principal = function () { return document.querySelector('main.sitio-main'); };
  var tipoDe = function (m) { return m.classList.contains('pagina-inicio') ? 'inicio' : m.classList.contains('pagina-proyecto') ? 'proyecto' : m.classList.contains('pagina-listado') ? 'listado' : 'otra'; };

  function pedir(url) {
    var k = url.split('#')[0];
    if (!cache.has(k)) {
      cache.set(k, fetch(k, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) { throw new Error('http ' + r.status); }
        return r.text();
      }).then(function (t) { return new DOMParser().parseFromString(t, 'text/html'); }));
    }
    return cache.get(k);
  }
  VTB.prefetch = function (url) { pedir(url).catch(function () { cache.delete(url.split('#')[0]); }); };

  function montar(raiz) { limpiezas = VTB.montar.map(function (f) { try { return f(raiz); } catch (e) { console.error(e); } }).filter(Boolean); }
  function desmontar() { limpiezas.forEach(function (f) { try { f(); } catch (e) { /* ignorar */ } }); limpiezas = []; }

  /* Accesibilidad: tras cambiar de vista se anuncia el título y el foco pasa al contenido nuevo; el menú marca la sección actual. */
  var anuncio = document.createElement('p');
  anuncio.className = 'sr-only'; anuncio.setAttribute('role', 'status'); anuncio.setAttribute('aria-live', 'polite');
  document.body.appendChild(anuncio);
  function anunciar(titulo, main) {
    anuncio.textContent = titulo;
    main.setAttribute('tabindex', '-1');
    main.focus({ preventScroll: true });
  }
  function marcarMenu() {
    document.querySelectorAll('header.top .wp-block-navigation a').forEach(function (a) {
      var u; try { u = new URL(a.href, location.href); } catch (e) { return; }
      var actual = rp(u.pathname) === rp(location.pathname) || (rp(u.pathname) !== '/' && rp(location.pathname).indexOf(rp(u.pathname)) === 0);
      var enHome = rp(location.pathname) === '/';
      if (rp(u.pathname) === '/proyectos/') { actual = /^\/(proyectos|tipologia|ubicacion)\//.test(rp(location.pathname)); }   // «Proyectos»: la lista, sus fichas y sus archivos de taxonomía
      else if (u.search === '?modo=fotos') { actual = (enHome && /[?&](modo=fotos|filtro=)/.test(location.search)) || /^\/(proyectos|tipologia|ubicacion)\//.test(rp(location.pathname)); }   // «Proyectos» del menú
      else if (/^\?filtro=/.test(u.search)) { actual = enHome && location.search === u.search; }
      if (actual) { a.setAttribute('aria-current', 'page'); } else { a.removeAttribute('aria-current'); }
    });
  }

  var espera = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  // decode() puede no resolverse si la pestaña no pinta (en segundo plano): nunca debe bloquear la navegación
  var conLimite = function (p, ms) { return Promise.race([p, espera(ms || 600)]); };
  var rectDe = function (el) { var r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
  var visible = function (r) { return r && r.width > 0 && r.top < innerHeight && r.top + r.height > 0 && r.left < innerWidth && r.left + r.width > 0; };

  /* Imagen fija que vuela de un rectángulo a otro (ambos con la misma proporción): cubre el cambio de DOM sin parpadeo. */
  function prepararVuelo(src, desde, srcObjeto) {
    var img = new Image();
    img.src = src; img.alt = ''; img.className = 'vtb-hero';
    img.style.cssText = 'left:' + desde.left + 'px;top:' + desde.top + 'px;width:' + desde.width + 'px;height:' + desde.height + 'px';
    document.body.appendChild(img);
    // si la pieza de origen era un objeto sin fondo, el objeto se queda encima y se disuelve en la foto durante el vuelo
    var objeto = null;
    if (srcObjeto) {
      objeto = new Image(); objeto.src = srcObjeto; objeto.alt = ''; objeto.className = 'vtb-hero';
      objeto.style.cssText = img.style.cssText; objeto.style.zIndex = '201';
      img.style.opacity = '0';                                     // la foto aparece fundiéndose mientras el objeto se disuelve
      document.body.appendChild(objeto);
    }
    var final = null;       // capa del objeto al que se disuelve la foto al llegar (vuelta a una miniatura que es un objeto)
    var limpiar = function () { img.remove(); if (objeto) { objeto.remove(); } if (final) { final.remove(); } };
    // las imágenes del vuelo deben estar decodificadas ANTES de cambiar el DOM; si no, hay un instante en que la miniatura ya no está y el vuelo aún no se pinta
    var listo = Promise.all([img, objeto].filter(Boolean).map(function (i) { return i.decode ? i.decode().catch(function () {}) : Promise.resolve(); }));
    return {
      listo: listo,
      // espejo de la ida: la foto vuela y, durante el último tramo, se disuelve en el objeto que la espera en la miniatura
      agregarObjetoFinal: function (src) {
        final = new Image(); final.src = src; final.alt = ''; final.className = 'vtb-hero';
        final.style.cssText = img.style.cssText; final.style.zIndex = '201'; final.style.opacity = '0';
        document.body.appendChild(final);
        return final.decode ? final.decode().catch(function () {}) : Promise.resolve();
      },
      volar: function (hasta, opciones) {
        opciones = opciones || {};
        return new Promise(function (resolver) {
          var fin = function () {
            if (opciones.fundirAlFinal && !quieto) { var f = img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' }); f.onfinish = function () { limpiar(); resolver(); }; }
            else { limpiar(); resolver(); }
          };
          if (quieto || !hasta) { limpiar(); resolver(); return; }
          var marcos = [{ left: desde.left + 'px', top: desde.top + 'px', width: desde.width + 'px', height: desde.height + 'px' },
                        { left: hasta.left + 'px', top: hasta.top + 'px', width: hasta.width + 'px', height: hasta.height + 'px' }];
          var opt = { duration: VUELO_MS, easing: EASE, fill: 'forwards' };
          if (objeto) {
            objeto.animate(marcos, opt);
            objeto.animate([{ opacity: 1 }, { opacity: 0 }], { duration: VUELO_MS * 0.6, easing: 'ease-in-out', fill: 'forwards' });
            img.animate([{ opacity: 0 }, { opacity: 1 }], { duration: VUELO_MS * 0.6, easing: 'ease-in-out', fill: 'forwards' });
          }
          if (final) {
            var t0 = VUELO_MS * 0.4, t1 = VUELO_MS * 0.6;      // ida: el objeto se disuelve en el primer 60 %; vuelta: aparece en el último 60 %
            final.animate(marcos, opt);
            final.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t1, delay: t0, easing: 'ease-in-out', fill: 'both' });
            img.animate([{ opacity: 1 }, { opacity: 0 }], { duration: t1, delay: t0, easing: 'ease-in-out', fill: 'forwards' });
          }
          var a = img.animate(marcos, opt);
          a.onfinish = fin; a.oncancel = fin;
        });
      },
      quitar: limpiar,
    };
  }

  function enlaceInterno(a) {
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) { return false; }
    if (a.closest('#wpadminbar, .wp-block-navigation__responsive-container-open, .wp-block-navigation__responsive-container-close')) { return false; }
    var u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) { return false; }
    if (/^\/wp-(admin|login|json|content|includes)|\.(xml|pdf|zip|jpe?g|png|webp|gif|svg|mp4)$/i.test(rp(u.pathname))) { return false; }
    if (rp(u.pathname) === rp(location.pathname) && u.search === location.search && u.hash) { return false; }   // ancla en la misma página
    return true;
  }

  async function navegar(url, opts) {
    opts = opts || {};
    if (navegando) { return; }
    navegando = true;
    // recuerda dónde estabas (en un popstate la entrada actual ya es la de destino: no se toca)
    if (!opts.popstate) { try { history.replaceState(Object.assign({}, history.state, { y: window.scrollY }), '', location.href); } catch (e) { /* ignorar */ } }
    var anterior = principal(), tipoAnt = anterior ? tipoDe(anterior) : 'otra';
    try {
      var docP = pedir(url);

      // 1 · SALIDA: qué imagen sirve de origen del vuelo y cómo sale la vista actual
      var origen = opts.origen || null;
      if (!origen && opts.imgOrigen) { origen = { rect: rectDe(opts.imgOrigen), src: opts.imgOrigen.currentSrc || opts.imgOrigen.src }; }
      var proyectoActualId = null, imagenElegida = null;
      if (tipoAnt === 'proyecto') {
        var f = anterior.querySelector('.ficha'); proyectoActualId = f ? parseInt(f.dataset.proyecto, 10) : null;
        var ia = VTB.vistas.imagenActiva(anterior);
        if (ia && !origen) { var r0 = rectDe(ia); if (visible(r0)) { origen = { rect: r0, src: ia.currentSrc || ia.src, deProyecto: true }; } }
        // vuelta al inicio con el campo en modo objeto: vuela el objeto de la carta (si está a la vista), no la foto
        var du; try { du = new URL(url, location.href); } catch (e) { du = null; }
        var objCartaSalida = anterior.querySelector('.pv.en-primero .carta-arte:not(.es-sello) img');
        if (objCartaSalida && du && du.origin === location.origin && rp(du.pathname) === '/' && !/[?&](modo=fotos|filtro=)/.test(du.search) && VTB.modoObjetoActivo && VTB.modoObjetoActivo()) {
          var ro = rectDe(objCartaSalida);
          if (visible(ro) && getComputedStyle(objCartaSalida.closest('.carta')).opacity > 0.5) { origen = { rect: ro, src: objCartaSalida.currentSrc || objCartaSalida.src, deProyecto: true, soloObjeto: true }; }
        }
        if (ia && ia.naturalWidth) { imagenElegida = { id: proyectoActualId, src: ia.currentSrc || ia.src, ar: ia.naturalWidth / ia.naturalHeight }; }   // la imagen de la galería que quedó a la vista
      }
      var salida = origen ? Promise.resolve() : (anterior.classList.add('fuera'), espera(quieto ? 0 : 300));
      var doc = await Promise.all([docP, salida]).then(function (v) { return v[0]; });

      var nuevo = doc.querySelector('main.sitio-main');
      if (!nuevo) { throw new Error('sin main'); }
      var tipoNue = tipoDe(nuevo);

      // 2 · El vuelo se prepara ANTES del cambio: la imagen ya cubre el sitio de la miniatura cuando el DOM cambia
      var vuelo = null;
      var puedeVolar = origen && ((tipoNue === 'proyecto' && !origen.deProyecto) || (tipoNue === 'inicio' && origen.deProyecto));
      // ida desde una celda que muestra un objeto sin fondo: el objeto vuela al objeto de la carta (no a la imagen principal)
      var objetoALaCarta = !!(puedeVolar && tipoNue === 'proyecto' && origen.desdeObjeto && origen.srcObjeto && nuevo.querySelector('.carta-arte:not(.es-sello) img'));
      if (objetoALaCarta) { origen = { rect: origen.rect, src: origen.srcObjeto }; }
      if (puedeVolar) { vuelo = prepararVuelo(origen.src, origen.rect, origen.srcObjeto); await conLimite(vuelo.listo, 600); }
      if (tipoNue === 'inicio' && proyectoActualId) { VTB.volverA = proyectoActualId; }
      // al volver al inicio, la miniatura del proyecto pasa a mostrar la última imagen de la galería que se estaba viendo
      if (tipoNue === 'inicio' && imagenElegida) { VTB.fotoElegida = VTB.fotoElegida || {}; VTB.fotoElegida[imagenElegida.id] = { src: imagenElegida.src, ar: imagenElegida.ar }; }
      // «Vertebral» (la marca) y cualquier enlace al inicio sin parámetros abren el campo sin filtros; «atrás» conserva el que hubiera
      VTB.reiniciarFiltro = tipoNue === 'inicio' && !opts.popstate && !/[?&](filtro|modo)=/.test(new URL(url, location.href).search);

      // 3 · CAMBIO DE DOM
      desmontar();
      var inyectado = document.importNode(nuevo, true);
      if (!puedeVolar) { inyectado.classList.add('fuera'); }
      anterior.replaceWith(inyectado);
      document.body.className = doc.body.className;
      document.title = doc.title;
      if (!opts.popstate && !opts.sinHistorial) { history.pushState({ vtb: 1 }, '', url); }
      // salto inmediato: con `scroll-behavior:smooth` en <html> la vista nueva se recorrería de abajo hacia arriba
      window.scrollTo({ top: opts.popstate && history.state && history.state.y && tipoNue !== 'proyecto' ? history.state.y : 0, left: 0, behavior: 'instant' });
      montar(inyectado);
      anunciar(doc.title, inyectado);
      marcarMenu();
      if (VTB.medirCabecera) { VTB.medirCabecera(); }

      // 4 · ENTRADA
      if (vuelo) {
        var destino = null, ocultar = null;
        if (tipoNue === 'proyecto') {
          var pv = inyectado.querySelector('.pv'), im = VTB.vistas.imagenActiva(inyectado);
          var objCarta = objetoALaCarta ? inyectado.querySelector('.carta-arte img') : null;
          if (pv && objCarta) {
            pv.classList.add('preparando'); objCarta.style.visibility = 'hidden';
            await conLimite(objCarta.decode ? objCarta.decode().catch(function () {}) : Promise.resolve(), 800);
            destino = rectDe(objCarta); ocultar = function () { objCarta.style.visibility = ''; pv.classList.add('aparece'); pv.classList.remove('preparando'); };
          } else if (pv && im) { pv.classList.add('preparando'); await conLimite(im.decode ? im.decode().catch(function () {}) : Promise.resolve(), 800); destino = rectDe(im); ocultar = function () { pv.classList.remove('preparando'); }; }
        } else if (VTB.campo && proyectoActualId) {
          var t = VTB.campo.rectDe(proyectoActualId);
          if (t) {
            // la miniatura recién creada aún puede no haber cargado: sin sus dimensiones reales el destino mediría 0 de ancho o de alto
            if (t.img.decode) { await conLimite(t.img.decode().catch(function () {}), 600); }
            destino = rectDe(t.img); t.img.style.visibility = 'hidden'; ocultar = function () { t.img.style.visibility = ''; };
            if (t.img.closest('.es-objeto') !== null && !origen.soloObjeto) { await conLimite(vuelo.agregarObjetoFinal(t.img.currentSrc || t.img.src), 600); }   // la miniatura es un objeto: la foto se disuelve en él durante el vuelo
          }
        }
        await vuelo.volar(destino);
        if (ocultar) { ocultar(); }
      } else {
        await espera(30);
        inyectado.classList.remove('fuera');
      }
    } catch (err) {
      console.warn('Navegación normal:', err);
      location.href = url;
      return;
    } finally { navegando = false; }
  }
  VTB.navegar = navegar;

  /* ───────── Enlaces y botón «atrás» ───────── */
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) { return; }
    var a = e.target.closest && e.target.closest('a[href]');
    if (!enlaceInterno(a)) { return; }
    e.preventDefault();
    var menuAbierto = a.closest('.wp-block-navigation__responsive-container.is-menu-open');   // un enlace del menú lo cierra
    if (menuAbierto) { var cerrar = menuAbierto.querySelector('.wp-block-navigation__responsive-container-close'); if (cerrar) { cerrar.click(); } }
    var opts = {};
    var tarjeta = a.closest('.pieza-enlace');
    if (tarjeta) { opts.imgOrigen = tarjeta.querySelector('img.base'); }     // listado → ficha: vuela la foto de la tarjeta
    var obraParecida = a.closest('.tarjeta');                                // «Obra parecida» → otra ficha: mismo vuelo que del campo a un proyecto
    if (obraParecida && !opts.imgOrigen) { var im = obraParecida.querySelector('.tarjeta-img img'); if (im && im.complete && im.naturalWidth) { opts.imgOrigen = im; } }
    navegar(a.href, opts);
  });
  document.addEventListener('pointerover', function (e) {                    // precarga al apuntar: la ficha llega antes del clic
    var a = e.target.closest && e.target.closest('a[href]');
    if (enlaceInterno(a)) { VTB.prefetch(a.href); }
  }, { passive: true });
  window.addEventListener('popstate', function () { navegar(location.href, { popstate: true }); });
  if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }

  /* Primera carga */
  var estadoPrevio = history.state || {};                       // si se llega por «atrás» tras una recarga, la entrada ya trae su scroll
  history.replaceState(Object.assign({ vtb: 1 }, estadoPrevio), '', location.href);
  var m0 = principal();
  if (m0) {
    montar(m0); marcarMenu();
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    if (estadoPrevio.y && nav && nav.type === 'back_forward' && !m0.classList.contains('pagina-proyecto')) { window.scrollTo(0, estadoPrevio.y); }
  }
})();
