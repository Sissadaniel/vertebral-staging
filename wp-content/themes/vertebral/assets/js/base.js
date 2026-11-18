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
