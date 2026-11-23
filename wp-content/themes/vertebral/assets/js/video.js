/* Vertebral · pop-up de video: los enlaces a[data-video] (YouTube / Vimeo) se reproducen en una ventana sobre la página.
 * Un solo oyente delegado en document: sirve también tras las navegaciones del router. Sin JS, el enlace abre el video en otra pestaña. */
(function () {
  'use strict';
  var abierto = null;

  function embebido(url) {
    var m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
    if (m) { return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?autoplay=1&rel=0'; }
    m = String(url).match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (m) { return 'https://player.vimeo.com/video/' + m[1] + '?autoplay=1'; }
    return null;
  }

  function cerrar() {
    if (!abierto) { return; }
    var a = abierto; abierto = null;
    document.removeEventListener('keydown', a.teclas, true);
    document.body.classList.remove('video-abierto');
    a.el.classList.remove('visible'); var vid = a.el.querySelector('video'); if (vid) { vid.pause(); }
    setTimeout(function () { a.el.remove(); }, 260);   // el iframe se destruye: el video deja de sonar
    if (a.disparador && a.disparador.focus) { a.disparador.focus({ preventScroll: true }); }
  }

  function abrir(enlace) {
    var href = enlace.getAttribute('href'), src = embebido(href), archivo = /\.(mp4|webm|mov)(\?|$)/i.test(href || '');
    if (!src && !archivo) { return false; }
    cerrar();
    var el = document.createElement('div');
    el.className = 'video-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', (enlace.getAttribute('data-titulo') || enlace.textContent || 'Video').trim());
    el.innerHTML = '<div class="video-pop-marco"><button type="button" class="video-pop-cerrar">Cerrar</button>' +
      '<div class="video-pop-pantalla">' + (archivo
        ? '<video src="' + href.replace(/"/g, '&quot;') + '" controls autoplay playsinline></video>'
        : '<iframe src="' + src + '" title="" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>') + '</div></div>';
    document.body.appendChild(el); document.body.classList.add('video-abierto');
    var teclas = function (e) { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } };
    document.addEventListener('keydown', teclas, true);
    el.addEventListener('click', function (e) { if (e.target === el || e.target.closest('.video-pop-cerrar')) { cerrar(); } });
    abierto = { el: el, teclas: teclas, disparador: enlace };
    requestAnimationFrame(function () { el.classList.add('visible'); el.querySelector('.video-pop-cerrar').focus({ preventScroll: true }); });
    return true;
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-video]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) { return; }
    if (abrir(a)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
