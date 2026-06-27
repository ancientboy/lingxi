/**
 * Lume 统一弹窗 — showLumeAlert / showLumeConfirm / showLumeToast
 */

(function () {
  let dialogResolve = null;

  function getOverlay() {
    return document.getElementById('lumeDialogOverlay');
  }

  function ensureToastStack() {
    let stack = document.getElementById('lumeToastStack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'lumeToastStack';
      stack.className = 'lume-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function closeLumeDialog(result) {
    const overlay = getOverlay();
    if (overlay) {
      overlay.classList.remove('show');
      overlay.hidden = true;
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (dialogResolve) {
      dialogResolve(result);
      dialogResolve = null;
    }
  }

  function showLumeDialog(options) {
    const overlay = getOverlay();
    if (!overlay) {
      if (options.type === 'confirm') {
        return Promise.resolve(window.confirm(options.message || ''));
      }
      window.alert(options.message || '');
      return Promise.resolve(true);
    }

    const titleEl = document.getElementById('lumeDialogTitle');
    const msgEl = document.getElementById('lumeDialogMessage');
    const footer = document.getElementById('lumeDialogFooter');
    if (!titleEl || !msgEl || !footer) {
      return Promise.resolve(false);
    }

    const {
      type = 'alert',
      title = type === 'confirm' ? '请确认' : '提示',
      message = '',
      confirmText = '确定',
      cancelText = '取消',
      danger = false,
    } = options;

    titleEl.textContent = title;
    msgEl.textContent = message;
    footer.innerHTML = '';

    if (type === 'confirm') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'lume-dialog-btn lume-dialog-btn-ghost';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => closeLumeDialog(false));

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = `lume-dialog-btn ${danger ? 'lume-dialog-btn-danger' : 'lume-dialog-btn-primary'}`;
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => closeLumeDialog(true));

      footer.append(cancelBtn, okBtn);
      setTimeout(() => okBtn.focus(), 0);
    } else {
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'lume-dialog-btn lume-dialog-btn-primary';
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => closeLumeDialog(true));
      footer.append(okBtn);
      setTimeout(() => okBtn.focus(), 0);
    }

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('show');

    return new Promise((resolve) => {
      dialogResolve = resolve;
    });
  }

  function showLumeAlert(message, options) {
    const opts = typeof options === 'string' ? { title: options } : (options || {});
    return showLumeDialog({
      type: 'alert',
      title: opts.title || '提示',
      message,
      confirmText: opts.confirmText || '知道了',
    });
  }

  function showLumeConfirm(message, options = {}) {
    return showLumeDialog({
      type: 'confirm',
      title: options.title || '请确认',
      message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      danger: options.danger || false,
    });
  }

  function showLumeToast(message, type = 'info') {
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = `lume-toast lume-toast-${type}`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      setTimeout(() => toast.remove(), 280);
    }, 2800);
  }

  function bindOverlay() {
    const overlay = getOverlay();
    if (!overlay) return;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeLumeDialog(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('show')) {
        closeLumeDialog(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindOverlay);
  } else {
    bindOverlay();
  }

  window.showLumeDialog = showLumeDialog;
  window.showLumeAlert = showLumeAlert;
  window.showLumeConfirm = showLumeConfirm;
  window.showLumeToast = showLumeToast;
  window.closeLumeDialog = closeLumeDialog;
})();
