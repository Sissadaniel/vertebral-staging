/* Vertebral · formulario de contacto: envío sin recargar (sin JS, el formulario también funciona: redirige con ?contacto=ok). */
(function () {
  'use strict';
  window.VTB.montar.push(function (main) {
    var raiz = main.querySelector('[data-contacto]');
    if (!raiz) { return; }
    var form = raiz.querySelector('form'), estado = raiz.querySelector('.cf-estado'), boton = form.querySelector('button[type="submit"]');
    var decir = function (t, error) { estado.textContent = t; estado.classList.toggle('es-error', !!error); };
    var alEnviar = function (e) {
      e.preventDefault();
      if (!form.querySelector('input[name="razon"]:checked')) { decir('Elige una razón de contacto.', true); return; }
      var c = form.querySelector('input[name="correo"]');
      if (!c.value || !c.validity.valid) { decir('Escribe un correo válido.', true); c.focus(); return; }
      boton.disabled = true; decir('Enviando…');
      fetch(form.getAttribute('action'), { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'XMLHttpRequest' }, credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return { ok: false, mensaje: 'No se pudo enviar. Inténtalo de nuevo.' }; }); })
        .then(function (j) { decir(j.mensaje, !j.ok); if (j.ok) { form.reset(); } })
        .catch(function () { decir('No se pudo enviar. Revisa tu conexión.', true); })
        .then(function () { boton.disabled = false; });
    };
    form.addEventListener('submit', alEnviar);
    return function () { form.removeEventListener('submit', alEnviar); };
  });
})();
