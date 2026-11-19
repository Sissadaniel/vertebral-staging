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
