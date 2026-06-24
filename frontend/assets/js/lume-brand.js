/**
 * Lume brand mark — standalone SVG (no background box).
 * Layers are named for CSS / future motion (Claude-style idle glow).
 */
(function () {
  const MARK_VIEWBOX = '0 0 48 48';

  function markSvg(size, animate) {
    const animClass = animate ? ' lume-mark--animate' : '';
    return (
      `<svg class="lume-mark${animClass}" width="${size}" height="${size}" viewBox="${MARK_VIEWBOX}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
      '<g class="lume-mark-rays">' +
      '<path class="lume-ray lume-ray-1" d="M28 8.5c2.8 2.1 4.6 5.2 5.1 8.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.22"/>' +
      '<path class="lume-ray lume-ray-2" d="M31.5 10.5c1.8 2.2 2.6 5 2.3 7.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.14"/>' +
      '<path class="lume-ray lume-ray-3" d="M25 6.5c1.5 1.2 2.6 2.8 3.2 4.6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" opacity="0.18"/>' +
      '</g>' +
      '<g class="lume-mark-light">' +
      '<circle class="lume-glow-halo" cx="28" cy="15" r="8.5" fill="currentColor" opacity="0.12"/>' +
      '<circle class="lume-glow-core" cx="28" cy="15" r="4.25" fill="currentColor"/>' +
      '</g>' +
      '<g class="lume-mark-body">' +
      '<rect class="lume-mark-stem" x="10" y="12" width="6" height="18" rx="3" fill="currentColor"/>' +
      '<rect class="lume-mark-foot" x="10" y="27" width="16" height="6" rx="3" fill="currentColor"/>' +
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
