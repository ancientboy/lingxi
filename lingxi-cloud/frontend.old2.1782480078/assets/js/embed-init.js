/**
 * 检测 iframe / embedded 模式，统一添加 body 类名
 */
(function () {
  var embedded =
    window.parent !== window ||
    /(?:^|[?&])embedded=1(?:&|$)/.test(window.location.search || '');
  if (!embedded) return;

  function apply() {
    document.documentElement.classList.add('is-embedded');
    if (document.body) {
      document.body.classList.add('embedded', 'in-iframe', 'lume-page');
    }
  }

  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply);
})();
