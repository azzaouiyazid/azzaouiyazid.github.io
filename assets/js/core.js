/* Shared helpers and palette for the page scripts. Every other script reads them from window.Site. */
(function () {
  'use strict';
  const Site = (window.Site = window.Site || {});

  /**
   * Throw when an invariant does not hold.
   *
   * We throw instead of logging because each caller that can meet bad data (the brain model, the
   * hand-written connection graph) sits behind one handler that switches the page to its no-3D
   * version and prints the message in the console. A half-drawn brain would be worse than none.
   *
   * @param {boolean} cond     what must be true
   * @param {string} message   what was expected, shown in the console when it is not
   */
  Site.assert = function assert(cond, message) {
    if (!cond) throw new Error(`invariant failed: ${message}`);
  };

  /** Smooth step from 0 at a to 1 at b; a > b runs it backwards, which the scroll code relies on. */
  Site.sst = function sst(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  /** Cubic ease-in-out on [0, 1]. */
  Site.ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  Site.lerp = (a, b, t) => a + (b - a) * t;

  // we honour the system setting: people who ask for less motion get no spin, sway or pulses
  Site.RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // phones and tablets cannot hover, so details open on tap and the hints say "tap"
  Site.TOUCH = window.matchMedia('(hover: none)').matches;

  // the page palette from site.css, repeated because three.js colours cannot read CSS variables;
  // change both together
  // TODO: read these from getComputedStyle(document.documentElement) at start-up, so site.css is the only copy
  Site.COLORS = {
    caramel: '#B85C24', teal: '#2C7A74', plum: '#8C5A86', olive: '#7A8A36', brown: '#8A5A3B',
    cream: '#FBF3E7', ink: '#4E3222', ink2: '#75543F', edge: '#A9825F',
  };
})();
