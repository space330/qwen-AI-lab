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

// Wire reveals + fluid pause. Returns a cleanup() that disconnects observers.
export function initLandingMotion(root, { win } = {}) {
  if (!root) return () => {};
  const w = win || (typeof window !== "undefined" ? window : undefined);
  const nodes = collectReveals(root);

  const revealAll = () => nodes.forEach((n) => n.classList.add("in-view"));

  if (!w || prefersReducedMotion(w) || typeof w.IntersectionObserver !== "function") {
    revealAll();
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

  return () => {
    observer.disconnect();
    heroObserver?.disconnect();
  };
}
