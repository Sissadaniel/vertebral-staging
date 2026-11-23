/* Registro global: cada módulo de vista añade una función a VTB.montar; el router la llama con el <main> nuevo en cada
   navegación (y en la primera carga) y guarda la función de limpieza que devuelve. */
window.VTB = window.VTB || { montar: [], vistas: {} };

/* La cabecera cambia de alto según el ancho (la marca y el menú se parten en móvil): se mide en vez de suponerlo. */
(function () {
  var medir = function () {
    var h = document.querySelector('header.top');
    if (h) { document.documentElement.style.setProperty('--header-alto', Math.round(h.getBoundingClientRect().height) + 'px'); }
  };
  window.VTB.medirCabecera = medir;
  window.addEventListener('resize', medir);
  document.addEventListener('DOMContentLoaded', medir);
  window.addEventListener('load', medir);
  medir();
})();

/* Cabecera que se esconde al bajar y reaparece al subir. Se mide el desplazamiento acumulado (no cada evento) para ignorar
   temblores; arriba del todo siempre es visible, y se muestra al instante en cada navegación (el router salta al inicio). */
(function () {
  var raiz = document.documentElement, ultimo = window.scrollY, acum = 0, pend = false;
  var UMBRAL = 8;
  var cuando = function () {
    pend = false;
    var y = window.scrollY, d = y - ultimo; ultimo = y;
    raiz.classList.toggle('nav-scroll', y > 2);                   // con scroll el fondo de la cabecera es de color liso; la textura solo arriba del todo
    if (y < 80) { raiz.classList.remove('nav-oculta'); acum = 0; return; }
    if (d === 0) { return; }
    acum = (acum * d > 0) ? acum + d : d;                 // se reinicia al cambiar de sentido
    if (acum > UMBRAL) { if (!document.querySelector('.wp-block-navigation__responsive-container.is-menu-open')) { raiz.classList.add('nav-oculta'); } }
    else if (acum < -UMBRAL) { raiz.classList.remove('nav-oculta'); }
  };
  window.addEventListener('scroll', cuando, { passive: true });
  cuando();   // el cálculo es mínimo: sin rAF (que se pausa en pestañas ocultas)
  window.addEventListener('focusin', function (e) { if (e.target.closest && e.target.closest('header.top')) { raiz.classList.remove('nav-oculta'); } });
})();

/* «Filtros activos»: arriba del cajón de filtros, una píldora por cada filtro aplicado (home y listado). Quitarla = pulsar el
   filtro original (que ya sabe desmarcarse); se redibuja observando aria-pressed, así no depende de cómo guarde el estado cada vista. */
window.VTB.montar.push(function (raiz) {
  var sec = raiz.querySelector('[data-activos]');
  if (!sec) { return; }
  var lista = sec.querySelector('[data-activos-lista]');
  var origen = Array.prototype.slice.call(raiz.querySelectorAll('.filtro[data-grupo][aria-pressed]'));
  var pintar = function () {
    var activos = origen.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; });
    lista.textContent = '';
    var barra = raiz.querySelector('[data-activos-barra]'); if (barra) { barra.textContent = ''; }
    activos.forEach(function (b) {
      var n = b.cloneNode(true); var c = n.querySelector('.filtro-n'); if (c) { c.remove(); }
      var nombre = n.textContent.trim();
      var p = document.createElement('button');
      p.type = 'button'; p.className = 'filtro-activo';
      p.setAttribute('aria-label', 'Quitar filtro ' + nombre);
      p.innerHTML = '<span></span><i aria-hidden="true">&times;</i>';
      p.firstChild.textContent = nombre;
      p.addEventListener('click', function () { b.click(); });
      lista.appendChild(p);
      if (barra) { var p2 = p.cloneNode(true); p2.className = 'filtro-activo filtro-activo-barra'; p2.addEventListener('click', function () { b.click(); }); barra.appendChild(p2); }
    });
    sec.hidden = !activos.length;
    var q = raiz.querySelector('[data-filtro-limpiar]'); if (q) { q.hidden = !activos.length; }
  };
  var mo = new MutationObserver(pintar);
  origen.forEach(function (b) { mo.observe(b, { attributes: true, attributeFilter: ['aria-pressed'] }); });
  pintar();
  return function () { mo.disconnect(); };
});

/* Cursor propio: un punto que sigue al puntero; sobre algo interactivo crece (ease-out rápido) y se vuelve naranja. Solo con puntero fino
   (ratón/trackpad); en táctiles no existe. El cursor nativo se oculta con la clase html.cursor-propio. */
(function () {
  if (!window.matchMedia || !matchMedia('(hover:hover) and (pointer:fine)').matches) { return; }
  var pos = document.createElement('div'); pos.className = 'cursor-punto'; pos.setAttribute('aria-hidden', 'true');
  var dot = document.createElement('i'); pos.appendChild(dot);
  document.body.appendChild(pos);
  document.documentElement.classList.add('cursor-propio');
  var SEL = 'a,button,input,select,textarea,label,summary,[role="button"],[role="switch"],[role="tab"],[data-full],.campo-tile,.pv-zona,.pv-seg,.campo-zoom';
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') { return; }
    pos.style.transform = 'translate3d(' + e.clientX + 'px,' + e.clientY + 'px,0)';
    pos.classList.add('visible');
    var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
    pos.classList.toggle('sobre', !!t && !t.disabled && t.getAttribute('aria-disabled') !== 'true');
  }, { passive: true });
  document.addEventListener('pointerleave', function () { pos.classList.remove('visible'); });
  document.documentElement.addEventListener('mouseleave', function () { pos.classList.remove('visible'); });
  window.addEventListener('pointerdown', function () { pos.classList.add('presion'); });
  window.addEventListener('pointerup', function () { pos.classList.remove('presion'); });
})();
