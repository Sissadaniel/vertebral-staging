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
    if (y < 80) { raiz.classList.remove('nav-oculta'); acum = 0; return; }
    if (d === 0) { return; }
    acum = (acum * d > 0) ? acum + d : d;                 // se reinicia al cambiar de sentido
    if (acum > UMBRAL) { if (!document.querySelector('.wp-block-navigation__responsive-container.is-menu-open')) { raiz.classList.add('nav-oculta'); } }
    else if (acum < -UMBRAL) { raiz.classList.remove('nav-oculta'); }
  };
  window.addEventListener('scroll', cuando, { passive: true });   // el cálculo es mínimo: sin rAF (que se pausa en pestañas ocultas)
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
    });
    sec.hidden = !activos.length;
  };
  var mo = new MutationObserver(pintar);
  origen.forEach(function (b) { mo.observe(b, { attributes: true, attributeFilter: ['aria-pressed'] }); });
  pintar();
  return function () { mo.disconnect(); };
});
