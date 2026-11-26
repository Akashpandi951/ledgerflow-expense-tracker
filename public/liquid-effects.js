/**
 * LedgerFlow Liquid Glass Motion & Interactive Mouse Engine
 * Uses GSAP 3 when loaded online, with zero-dependency Web Animations/CSS fallback offline.
 * Respects prefers-reduced-motion and throttles mouse tracking via requestAnimationFrame.
 */
(function () {
  'use strict';

  const prefersReducedMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isTouchDevice = () =>
    'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);

  let rafPending = false;
  let lastX = -9999;
  let lastY = -9999;
  let activeMagnet = null;

  function initCursorGlowAndSpecular() {
    if (prefersReducedMotion() || isTouchDevice()) return;

    let glow = document.getElementById('liquid-cursor-glow');
    if (!glow) {
      glow = document.createElement('div');
      glow.id = 'liquid-cursor-glow';
      glow.className = 'liquid-cursor-glow';
      glow.setAttribute('aria-hidden', 'true');
      document.body.appendChild(glow);
    }

    document.addEventListener(
      'mousemove',
      (e) => {
        lastX = e.clientX;
        lastY = e.clientY;

        if (!rafPending) {
          rafPending = true;
          requestAnimationFrame(() => {
            rafPending = false;
            glow.style.transform = `translate3d(${lastX - 190}px, ${lastY - 190}px, 0)`;

            const el = document.elementFromPoint(lastX, lastY);
            const card = el && el.closest ? el.closest('.card, .modal-panel') : null;
            if (card) {
              const rect = card.getBoundingClientRect();
              card.style.setProperty('--mx', `${Math.round(lastX - rect.left)}px`);
              card.style.setProperty('--my', `${Math.round(lastY - rect.top)}px`);
            }

            const mag = el && el.closest ? el.closest('.btn-primary, .magnetic-btn') : null;
            if (activeMagnet && activeMagnet !== mag) {
              activeMagnet.style.transform = '';
              activeMagnet = null;
            }
            if (mag) {
              const r = mag.getBoundingClientRect();
              const dx = ((lastX - (r.left + r.width / 2)) / (r.width / 2)) * 4;
              const dy = ((lastY - (r.top + r.height / 2)) / (r.height / 2)) * 3;
              mag.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
              activeMagnet = mag;
            }
          });
        }
      },
      { passive: true }
    );

    document.addEventListener(
      'mouseleave',
      () => {
        glow.style.transform = 'translate3d(-9999px, -9999px, 0)';
        if (activeMagnet) {
          activeMagnet.style.transform = '';
          activeMagnet = null;
        }
      },
      { passive: true }
    );
  }

  function animateViewEntrance(container) {
    if (!container || prefersReducedMotion()) return;
    const cards = container.querySelectorAll('.card');
    if (!cards.length) return;

    if (window.gsap) {
      window.gsap.fromTo(
        cards,
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.34,
          stagger: 0.04,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        }
      );
    }
  }

  function animateCounters(container) {
    if (!container || prefersReducedMotion()) return;
    const els = container.querySelectorAll('[data-count-target]');
    els.forEach((el) => {
      const target = Number(el.dataset.countTarget);
      if (!Number.isFinite(target) || target === 0) return;
      const prefix = el.dataset.countPrefix || '';
      const suffix = el.dataset.countSuffix || '';
      const duration = 380;
      const start = performance.now();

      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const cur = Math.round(target * eased);
        el.textContent = `${prefix}${cur.toLocaleString('en-IN')}${suffix}`;
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  window.LedgerLiquidFX = {
    init: initCursorGlowAndSpecular,
    animateView: (container) => {
      animateViewEntrance(container);
      animateCounters(container);
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCursorGlowAndSpecular);
  } else {
    initCursorGlowAndSpecular();
  }
})();
