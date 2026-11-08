/* Where the brain sits on screen.
   This file is the one place those numbers live: the still image shown while the 3D loads (below)
   and the 3D scene (brain.js) both read place(), so the two line up exactly when we swap them.
   It loads in the body, right after the still image, because the image must be placed before
   the first paint and the 3D library is far too large to wait for. */
(function () {
  'use strict';
  const Site = (window.Site = window.Site || {});

  // below this width the page stacks, so the brain moves above the text instead of beside it
  const NARROW_PX = 900;
  // poster.webp was captured 2.4 brain radii wide, centred on the brain; changing the capture means changing this
  const POSTER_SPAN = 2.4;
  // the sticky top bar is about 58 px tall on phones; the brain must start below it
  const BAR_PX = 58;

  /**
   * Centre and radius of the brain on screen, in CSS pixels.
   *
   * Two poses: beside the text while the visitor reads "What I do" (map = false), and larger and
   * further left as the connection map (map = true). We size the radius from the smaller of the
   * free width and the viewport height because a lobe's shards fly out to about 1.3 radii, and
   * they must stay on screen on both a wide monitor and a short laptop. brain.js blends the two
   * poses while the visitor scrolls between the sections.
   *
   * @param {boolean} map  true for the connection-map pose
   * @param {number} vw    viewport width, CSS px
   * @param {number} vh    viewport height, CSS px
   * @returns {{x: number, y: number, r: number}} centre (x, y) and radius r, CSS px
   */
  function place(map, vw, vh) {
    const narrow = vw < NARROW_PX;
    if (!map) {
      return narrow
        ? { x: vw * 0.5, y: BAR_PX + vh * 0.22, r: Math.min(vw * 0.37, vh * 0.17) }
        : { x: vw * 0.71, y: vh * 0.53, r: Math.min(vw * 0.215, vh * 0.33) };
    }
    return narrow
      ? { x: vw * 0.5, y: vh * 0.64, r: Math.min(vw * 0.45, vh * 0.27) }
      : { x: vw * 0.655, y: vh * 0.54, r: Math.min(vw * 0.3, vh * 0.44) };
  }

  function placePoster() {
    const img = document.getElementById('poster');
    if (!img) return;
    const pose = place(false, document.documentElement.clientWidth, window.innerHeight);
    const size = POSTER_SPAN * pose.r;
    Object.assign(img.style, {
      left: `${pose.x - size / 2}px`,
      top: `${pose.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
    });
  }

  Site.NARROW_PX = NARROW_PX;
  Site.place = place;
  placePoster();
})();
