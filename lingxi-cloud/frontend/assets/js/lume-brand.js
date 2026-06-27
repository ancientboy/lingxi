/**
 * Lume brand mark — C1-13 hive nest (partner peek).
 * Layers: nest cell, face, partner dot — for CSS idle motion.
 */
(function () {
  const MARK_VIEWBOX = '0 0 48 48';

  function markSvg(size, animate) {
    const animClass = animate ? ' lume-mark--animate' : '';
    return (
      `<svg class="lume-mark${animClass}" width="${size}" height="${size}" viewBox="${MARK_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
      '<g class="lume-mark-nest">' +
      '<path class="lume-mark-cell" d="M 24 13 L 32 18 L 32 28 L 24 33 L 16 28 L 16 18 Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>' +
      '</g>' +
      '<g class="lume-mark-face">' +
      '<circle class="lume-mark-eye" cx="21" cy="22.5" r="2.4" fill="currentColor"/>' +
      '<path class="lume-mark-smile" d="M 19.5 27.8 Q 23.5 30.5 27.5 27.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '</g>' +
      '<g class="lume-mark-partner">' +
      '<circle class="lume-mark-partner-dot" cx="27.2" cy="23.8" r="1.65" fill="currentColor" opacity="0.5"/>' +
      '</g>' +
      '</svg>'
    );
  }

  function mountLumeMarks() {
    document.querySelectorAll('[data-lume-mark]').forEach((el) => {
      const size = parseInt(el.getAttribute('data-lume-mark') || '32', 10);
      const animate = el.getAttribute('data-lume-mark-animate') !== 'false';
      el.innerHTML = markSvg(size, animate);
    });
  }

  window.LumeBrand = { markSvg, mountLumeMarks };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountLumeMarks);
  } else {
    mountLumeMarks();
  }

  document.addEventListener('lume-brand-mount', mountLumeMarks);
})();
