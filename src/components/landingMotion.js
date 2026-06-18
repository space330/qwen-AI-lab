// Scroll-choreographed reveals for the landing page + hero-fluid pause.
// Pure helpers are DOM-free so they can be unit-tested without jsdom.

export function collectReveals(root) {
  return Array.from(root.querySelectorAll("[data-reveal]"));
}

export function revealOnIntersect(entries, { reveal, unobserve } = {}) {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      reveal?.(entry.target);
      unobserve?.(entry.target);
    }
  }
}

export function prefersReducedMotion(win) {
  return Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

export function parallaxOffset({ scrollY = 0, speed = 0.18, max = 180 } = {}) {
  const raw = Number(scrollY) * Number(speed);
  const cap = Math.abs(Number(max) || 0);
  return Math.round(Math.max(-cap, Math.min(cap, Number.isFinite(raw) ? raw : 0)));
}

export function tiltFromPointer({ x = 0, y = 0, rect, max = 8 } = {}) {
  const width = Math.max(1, Number(rect?.width) || 1);
  const height = Math.max(1, Number(rect?.height) || 1);
  const left = Number(rect?.left) || 0;
  const top = Number(rect?.top) || 0;
  const cap = Math.abs(Number(max) || 0);
  const px = ((Number(x) - left) / width - 0.5) * 2;
  const py = ((Number(y) - top) / height - 0.5) * 2;
  return {
    rx: normalizeZero(Math.round(Math.max(-cap, Math.min(cap, px * cap)))),
    ry: normalizeZero(Math.round(Math.max(-cap, Math.min(cap, -py * cap)))),
  };
}

export function countupValue({ from = 0, to = 0, progress = 1 } = {}) {
  const start = Number(from) || 0;
  const end = Number(to) || 0;
  const t = Math.max(0, Math.min(1, Number(progress) || 0));
  return Math.round(start + (end - start) * t);
}

// Wire reveals + fluid pause. Returns a cleanup() that disconnects observers.
export function initLandingMotion(root, { win } = {}) {
  if (!root) return () => {};
  const w = win || (typeof window !== "undefined" ? window : undefined);
  const nodes = collectReveals(root);
  const parallaxNodes = Array.from(root.querySelectorAll?.("[data-parallax]") || []);
  const tiltNodes = Array.from(root.querySelectorAll?.("[data-tilt]") || []);
  const counterNodes = Array.from(root.querySelectorAll?.("[data-counter]") || []);

  const revealAll = () => nodes.forEach((n) => n.classList.add("in-view"));
  const finishMotion = () => {
    revealAll();
    parallaxNodes.forEach((node) => node.style?.setProperty("--parallax-y", "0px"));
    tiltNodes.forEach((node) => {
      node.style?.setProperty("--rx", "0deg");
      node.style?.setProperty("--ry", "0deg");
    });
    counterNodes.forEach((node) => {
      const target = Number(node.dataset?.counter || 0);
      node.textContent = String(countupValue({ to: target, progress: 1 }));
      if (node.dataset) node.dataset.counted = "true";
    });
  };

  if (!w || prefersReducedMotion(w) || typeof w.IntersectionObserver !== "function") {
    finishMotion();
    return () => {};
  }

  const observer = new w.IntersectionObserver(
    (entries) =>
      revealOnIntersect(entries, {
        reveal: (t) => t.classList.add("in-view"),
        unobserve: (t) => observer.unobserve(t),
      }),
    { threshold: 0.18, rootMargin: "0px 0px -10% 0px" },
  );
  nodes.forEach((n) => observer.observe(n));

  // Pause hero fluid blobs when the hero scrolls out of view (battery).
  const hero = root.querySelector?.(".landing-hero");
  const fluid = root.querySelector?.(".landing-fluid");
  let heroObserver = null;
  if (hero && fluid) {
    heroObserver = new w.IntersectionObserver(
      (entries) =>
        entries.forEach((e) => fluid.classList.toggle("is-paused", !e.isIntersecting)),
      { threshold: 0 },
    );
    heroObserver.observe(hero);
  }

  let raf = 0;
  const updateParallax = () => {
    raf = 0;
    const scrollY = Number(w.scrollY || w.pageYOffset || 0);
    parallaxNodes.forEach((node) => {
      const speed = Number(node.dataset?.parallax || 0.18);
      const max = Number(node.dataset?.parallaxMax || 180);
      node.style?.setProperty("--parallax-y", `${parallaxOffset({ scrollY, speed, max })}px`);
    });
  };
  const onScroll = () => {
    if (raf || typeof w.requestAnimationFrame !== "function") return;
    raf = w.requestAnimationFrame(updateParallax);
  };
  if (parallaxNodes.length) {
    updateParallax();
    w.addEventListener?.("scroll", onScroll, { passive: true });
  }

  const tiltHandlers = tiltNodes.map((node) => {
    const onMove = (event) => {
      const { rx, ry } = tiltFromPointer({
        x: event.clientX,
        y: event.clientY,
        rect: node.getBoundingClientRect?.(),
        max: Number(node.dataset?.tilt || 8),
      });
      node.style?.setProperty("--rx", `${rx}deg`);
      node.style?.setProperty("--ry", `${ry}deg`);
    };
    const onLeave = () => {
      node.style?.setProperty("--rx", "0deg");
      node.style?.setProperty("--ry", "0deg");
    };
    node.addEventListener?.("pointermove", onMove, { passive: true });
    node.addEventListener?.("pointerleave", onLeave);
    return { node, onMove, onLeave };
  });

  let counterObserver = null;
  if (counterNodes.length) {
    counterObserver = new w.IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.target.dataset.counted === "true") return;
          entry.target.dataset.counted = "true";
          const target = Number(entry.target.dataset.counter || 0);
          const startTime = Date.now();
          const duration = 700;
          const tick = () => {
            const progress = Math.min(1, (Date.now() - startTime) / duration);
            entry.target.textContent = String(countupValue({ to: target, progress }));
            if (progress < 1) w.requestAnimationFrame?.(tick);
          };
          tick();
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.35 },
    );
    counterNodes.forEach((node) => counterObserver.observe(node));
  }

  return () => {
    if (raf) w.cancelAnimationFrame?.(raf);
    w.removeEventListener?.("scroll", onScroll);
    tiltHandlers.forEach(({ node, onMove, onLeave }) => {
      node.removeEventListener?.("pointermove", onMove);
      node.removeEventListener?.("pointerleave", onLeave);
    });
    observer.disconnect();
    heroObserver?.disconnect();
    counterObserver?.disconnect();
  };
}

function normalizeZero(value) {
  return Object.is(value, -0) ? 0 : value;
}
