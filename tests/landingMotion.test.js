import test from "node:test";
import assert from "node:assert/strict";
import {
  collectReveals,
  revealOnIntersect,
  prefersReducedMotion,
  initLandingMotion,
} from "../src/components/landingMotion.js";

test("revealOnIntersect reveals and unobserves only intersecting targets", () => {
  const revealed = [];
  const unobserved = [];
  const entries = [
    { isIntersecting: true, target: "a" },
    { isIntersecting: false, target: "b" },
    { isIntersecting: true, target: "c" },
  ];
  revealOnIntersect(entries, {
    reveal: (t) => revealed.push(t),
    unobserve: (t) => unobserved.push(t),
  });
  assert.deepEqual(revealed, ["a", "c"]);
  assert.deepEqual(unobserved, ["a", "c"]);
});

test("collectReveals queries the [data-reveal] selector and returns an array", () => {
  const nodes = [1, 2, 3];
  const root = {
    querySelectorAll: (sel) => {
      assert.equal(sel, "[data-reveal]");
      return nodes;
    },
  };
  assert.deepEqual(collectReveals(root), [1, 2, 3]);
});

test("prefersReducedMotion reads matchMedia", () => {
  const reduceWin = { matchMedia: (q) => ({ matches: q.includes("reduce") }) };
  const normalWin = { matchMedia: () => ({ matches: false }) };
  assert.equal(prefersReducedMotion(reduceWin), true);
  assert.equal(prefersReducedMotion(normalWin), false);
});

test("initLandingMotion reveals all immediately under reduced motion", () => {
  const added = [];
  const node = () => ({ classList: { add: (c) => added.push(c) } });
  const nodes = [node(), node()];
  const root = { querySelectorAll: () => nodes, querySelector: () => null };
  const win = { matchMedia: () => ({ matches: true }) };
  const cleanup = initLandingMotion(root, { win });
  assert.equal(added.filter((c) => c === "in-view").length, 2);
  assert.equal(typeof cleanup, "function");
  cleanup();
});

test("initLandingMotion observes each reveal node when IntersectionObserver exists", () => {
  const observed = [];
  class FakeIO {
    constructor(cb) { this.cb = cb; }
    observe(t) { observed.push(t); }
    unobserve() {}
    disconnect() {}
  }
  const node = () => ({ classList: { add() {} } });
  const nodes = [node(), node(), node()];
  const root = {
    querySelectorAll: (sel) => (sel === "[data-reveal]" ? nodes : []),
    querySelector: () => null,
  };
  const win = { matchMedia: () => ({ matches: false }), IntersectionObserver: FakeIO };
  const cleanup = initLandingMotion(root, { win });
  assert.equal(observed.length, 3);
  cleanup();
});
