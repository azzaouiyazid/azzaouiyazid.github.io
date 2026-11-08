/* The 3D brain: one anatomical mesh on a full-screen canvas behind the page.

   While the visitor reads "What I do", the lobe of the section in view breaks into shards and a
   small diagram rises out of it (illustrations.js). In "How my work connects" the brain turns to
   glass and carries the project map. The paper sheet with About, Work and the rest slides over the
   canvas, and we stop rendering once it covers the screen, so the page costs nothing further down.

   Mesh: Allen Human Reference Atlas-3D (2020), HuBMAP CCF 3D Reference Object Library, CC BY 4.0,
   simplified to about 45k faces and stored as quantised positions (see README). */
(function () {
  'use strict';
  const Site = window.Site;
  const { assert, sst, ease, lerp, RM, COLORS: COL, LOBES, NODES, EDGES } = Site;

  const canvas = document.getElementById('brain');
  const labelLayer = document.getElementById('labels');
  const card = document.getElementById('lobecard');
  const poster = document.getElementById('poster');

  // a narrow 30 degree lens at 6 units keeps perspective mild, so the brain reads as an object
  // rather than a wide-angle close-up; layout.js assumes nothing about these, brain.js converts
  const FOV_DEG = 30, CAMERA_Z = 6;
  // we cap the pixel ratio because a full-screen canvas at a phone's 3x would draw 9x the pixels
  // of 1x for little visible gain, and the physical material is not cheap
  const MAX_PIXEL_RATIO = 1.75;
  // if the first frames after loading average slower than this we drop to 1x; 30 ms is about 33 fps,
  // below which scrolling the shards starts to feel sticky
  const SLOW_FRAME_MS = 30, FRAMES_TO_JUDGE = 90;
  // frames slower than this are a background tab or a paused loop, not a slow device; we skip them
  const STALE_FRAME_MS = 250;
  const SHARDS_PER_LOBE = 44;
  // in the map the lobes keep 8% opacity: enough to read the outline, little enough to see the nodes
  const GLASS_OPACITY = 0.08;
  const AUTO_SPIN = 0.16; // rad/s while nothing is in focus
  const SEED = 7; // fixed so the shards and node placement are the same on every visit
  // map nodes sit inside the brain: 30% of the way out left-right, 86% up-down and front-back
  const INWARD_X = 0.3, INWARD_YZ = 0.86;

  // yaw that turns each research lobe towards the camera (0 frontal, 1 temporal, 2 occipital);
  // found by eye, because the mesh's own axes are not aligned with the lobes
  // TODO: derive these from the lobe centres, so a different or re-simplified mesh needs no retuning
  const FOCUS_YAW = [-Math.PI / 2 + 0.55, -Math.PI / 2 + 0.05, -Math.PI / 2 - 0.75];
  const MAP_YAW = -Math.PI / 2; // side view: front of the brain on the left
  const START_YAW = -Math.PI / 2 + 0.4; // must match the pose poster.webp was captured in

  // a section's weight rises over the first 30% of its scroll and falls over the last 30%, so one
  // lobe has closed before the next opens instead of two being half open at once
  const RAMP = 0.3;
  // where on screen a section counts as "being read": the middle on desktop; on phones the text
  // cards sit low, under the brain, so 80% of the way down
  const FOCUS_LINE_WIDE = 0.5, FOCUS_LINE_NARROW = 0.8;

  const BASE = new THREE.Color(0xC98A52), PALE = new THREE.Color(0xE2C3A0), GLASS = new THREE.Color(0xE6C49C), BLACK = new THREE.Color(0);

  if (!window.THREE || !hasWebGL()) {
    useFallback('WebGL or three.js unavailable');
    return;
  }

  let seed = SEED;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // Park-Miller: tiny and reproducible
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  let pixelRatio = Math.min(MAX_PIXEL_RATIO, devicePixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.8;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, 0.1, 60);
  camera.position.set(0, 0, CAMERA_Z);
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x5a3420, 0.65));
  const key = new THREE.DirectionalLight(0xfff0dc, 1.6);
  key.position.set(3, 4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd2a8, 0.7);
  rim.position.set(-3, 1, -3);
  scene.add(rim);

  // world: position and scale on screen; spin: the visitor's and the scroll's rotation;
  // pivot: moves the mesh so its centre sits at the origin, so it turns about its own middle
  const world = new THREE.Group(), spin = new THREE.Group(), pivot = new THREE.Group();
  scene.add(world);
  world.add(spin);
  spin.add(pivot);

  let vw = 1, vh = 1, narrow = false;
  let pxPerUnit = 1; // CSS px per world unit at the depth of the brain centre (z = 0)
  function resize() {
    vw = canvas.clientWidth;
    vh = canvas.clientHeight;
    narrow = vw < Site.NARROW_PX;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    pxPerUnit = vh / (2 * CAMERA_Z * Math.tan((FOV_DEG * Math.PI) / 360));
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const diagrams = Site.buildIllustrations(scene, labelLayer);
  const mapGroup = new THREE.Group();
  pivot.add(mapGroup);
  mapGroup.visible = false;

  const lobes = [];       // one mesh per lobe, with its state in userData
  const lobeCentre = [];  // centre of each lobe's bounding sphere, in mesh coordinates
  let radius = 1;         // farthest vertex from the mesh centre, mesh units
  let nodes = [], edges = [], mapPulses = null;
  let loadedAt = -1;      // performance.now() when the mesh became visible; -1 while loading
  let cardKey = null;     // which tooltip the card shows ("h<diagram>.<spot>" or "l<lobe>"), null when hidden

  // TODO: ship the mesh as binary (or meshopt-compressed) instead of base64 JSON; it would cut about
  // a third of the download, deferred because GitHub Pages already gzips the JSON to 365 KB
  fetch('assets/data/brain_lite.json')
    .then(r => {
      // fetch only rejects on network failure; a 404 or a GitHub error page must not reach JSON.parse silently
      if (!r.ok) throw new Error(`brain model: HTTP ${r.status}`);
      return r.json();
    })
    .then(buildBrain)
    .catch(err => useFallback(err.message || String(err)));


  /**
   * Decode the brain model and check it before anything is drawn.
   *
   * The file stores positions quantised to uint16 between per-axis bounds mn and mx, faces as
   * uint16 or uint32 vertex indices (u32 says which), and a region id per vertex (0-6, see
   * Site.LOBES). We assert the shapes because a truncated download decodes into garbage that
   * three.js would draw anyway, as a spiky mess, rather than fail.
   *
   * @param {{mn: number[], mx: number[], v: string, f: string, u32: number, r: string}} M  base64 fields
   * @returns {{pos: Float32Array, faces: Uint16Array|Uint32Array, region: Uint8Array, centre: number[]}}
   */
  function decodeMesh(M) {
    const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
    const q = new Uint16Array(bytes(M.v));
    const faces = M.u32 ? new Uint32Array(bytes(M.f)) : new Uint16Array(bytes(M.f));
    const region = new Uint8Array(bytes(M.r));
    const nVerts = q.length / 3;
    assert(Number.isInteger(nVerts) && nVerts > 0, `positions come in xyz triples, got ${q.length} values`);
    assert(region.length === nVerts, `one region per vertex: ${region.length} regions for ${nVerts} vertices`);
    assert(faces.length % 3 === 0, `faces come in triples, got ${faces.length} indices`);
    let maxIndex = 0;
    for (let i = 0; i < faces.length; i++) if (faces[i] > maxIndex) maxIndex = faces[i];
    assert(maxIndex < nVerts, `face index ${maxIndex} beyond ${nVerts} vertices`);
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) {
      const a = i % 3;
      pos[i] = M.mn[a] + ((M.mx[a] - M.mn[a]) * q[i]) / 65535;
    }
    const centre = [0, 1, 2].map(a => (M.mn[a] + M.mx[a]) / 2);
    return { pos, faces, region, centre };
  }

  function buildBrain(M) {
    const { pos, faces, region, centre } = decodeMesh(M);
    radius = 0;
    for (let i = 0; i < pos.length; i += 3) radius = Math.max(radius, Math.hypot(pos[i] - centre[0], pos[i + 1] - centre[1], pos[i + 2] - centre[2]));
    pivot.position.set(-centre[0], -centre[1], -centre[2]);
    const pools = [];
    for (let L = 0; L < LOBES.length; L++) {
      const { positions, index } = lobeGeometry(pos, faces, region, L);
      if (!index.length) {
        pools[L] = [];
        continue;
      }
      let geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const lc = geo.boundingSphere.center.clone();
      lobeCentre[L] = lc;
      pools[L] = nodeCandidates(positions, centre);
      const material = lobeMaterial();
      let uniforms = null;
      if (L < diagrams.length) {
        geo = shatter(geo, lc, centre);
        uniforms = { explode: { value: 0 }, time: { value: 0 } };
        makeShardShader(material, uniforms);
      }
      const mesh = new THREE.Mesh(geo, material);
      mesh.renderOrder = 2;
      mesh.userData = {
        L, uniforms, lift: 0,
        // hovered lobes lift outwards along this direction; flattened vertically so they don't jump up
        dir: V(lc.x - centre[0], (lc.y - centre[1]) * 0.6, lc.z - centre[2]).normalize(),
        color: new THREE.Color(LOBES[L].color),
        glow: new THREE.Color(LOBES[L].color).multiplyScalar(0.28),
      };
      pivot.add(mesh);
      lobes.push(mesh);
    }
    buildMap(pools, centre);
    relabel();
    loadedAt = performance.now();
    kick();
  }

  // gather one lobe's triangles and re-index its vertices from 0
  function lobeGeometry(pos, faces, region, L) {
    const remap = new Map(), positions = [], index = [];
    for (let t = 0; t < faces.length; t += 3) {
      // a face belongs to the region of its first vertex; regions share no vertices in this mesh
      if (region[faces[t]] !== L) continue;
      for (let k = 0; k < 3; k++) {
        const v = faces[t + k];
        let n = remap.get(v);
        if (n === undefined) {
          n = positions.length / 3;
          remap.set(v, n);
          positions.push(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
        }
        index.push(n);
      }
    }
    return { positions, index };
  }

  function lobeMaterial() {
    // transparent from the start, even while opaque, because three.js caches the shader program
    // per material and flipping the flag later would recompile it in the middle of a scroll
    return new THREE.MeshPhysicalMaterial({
      color: BASE.clone(), emissive: new THREE.Color(0), roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5,
      sheen: 0.4, sheenColor: new THREE.Color(0xffe2c0), transparent: true,
    });
  }

  /**
   * Teach a lobe's material to break apart. Each vertex carries its shard's centre (aC), drift
   * (aD), spin axis and angle (aR) and start delay (aDl), written by shatter(); the shader turns,
   * shrinks and pushes the shard by an amount that eases in with the uniform `explode` (0 to 1).
   * Shards start at different moments (the delay), so the lobe opens like a flower rather than
   * all at once. Normals turn with the shard, otherwise the lighting would not follow it.
   */
  function makeShardShader(material, uniforms) {
    material.side = THREE.DoubleSide; // a shard's inner face becomes visible once it turns
    material.onBeforeCompile = shader => {
      shader.uniforms.uE = uniforms.explode;
      shader.uniforms.uT = uniforms.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aC; attribute vec3 aD; attribute vec4 aR; attribute float aDl; uniform float uE; uniform float uT;
          vec3 rotA(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0 - c); }`)
        .replace('#include <beginnormal_vertex>', `float ef = smoothstep(aDl, aDl + 0.6, uE);
          vec3 objectNormal = rotA(normal, aR.xyz, aR.w*ef);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        // shards shrink to 60% so they never overlap the diagram card, and bob a little while open
        .replace('#include <begin_vertex>', `vec3 transformed = aC + rotA(position - aC, aR.xyz, aR.w*ef)*(1.0 - 0.4*ef)
          + aD*(ef + 0.06*ef*sin(uT*1.2 + aDl*37.0));`);
    };
    // every shard material shares one compiled program; without a key, three.js would compile three
    material.customProgramCacheKey = () => 'shards';
  }

  /**
   * Break a lobe's surface into SHARDS_PER_LOBE patches for the shard shader.
   *
   * Seeds are spread by farthest-point sampling, so the patches come out about equal in size, and
   * each face joins its nearest seed. Each shard then gets a drift, a spin and a start delay
   * (shardMotion). The geometry is de-indexed first, because a vertex shared by two shards would
   * stretch between them instead of letting them part.
   *
   * @param {THREE.BufferGeometry} geo  indexed lobe geometry with normals
   * @param {THREE.Vector3} lc          lobe centre, mesh coordinates
   * @param {number[]} centre           brain centre, mesh coordinates
   * @returns {THREE.BufferGeometry} non-indexed geometry with aC, aD, aR, aDl attributes
   */
  function shatter(geo, lc, centre) {
    const ng = geo.toNonIndexed();
    const fc = faceCentres(ng.attributes.position.array);
    const nFaces = fc.length / 3;
    const seeds = farthestPointSeeds(fc, SHARDS_PER_LOBE);
    const shardOf = nearestSeed(fc, seeds);
    const centres = shardCentres(fc, shardOf, SHARDS_PER_LOBE);
    const outward = V(lc.x - centre[0], lc.y - centre[1], lc.z - centre[2]).normalize();
    const shards = centres.map(c => shardMotion(c, lc, outward));
    writeShardAttributes(ng, shards, shardOf, nFaces);
    ng.computeBoundingSphere();
    return ng;
  }

  // centre of each triangle of a non-indexed position array (9 floats per face)
  function faceCentres(pa) {
    const nFaces = pa.length / 9;
    const fc = new Float32Array(nFaces * 3);
    for (let f = 0; f < nFaces; f++) {
      for (let a = 0; a < 3; a++) fc[3 * f + a] = (pa[9 * f + a] + pa[9 * f + 3 + a] + pa[9 * f + 6 + a]) / 3;
    }
    return fc;
  }

  function dist2(fc, f, s) {
    const x = fc[3 * f] - fc[3 * s], y = fc[3 * f + 1] - fc[3 * s + 1], z = fc[3 * f + 2] - fc[3 * s + 2];
    return x * x + y * y + z * z;
  }

  // farthest-point sampling over 1,600 random faces: enough to place 44 seeds evenly, and fast
  // enough that the three lobes together shatter in well under a second on a phone
  function farthestPointSeeds(fc, k) {
    const nFaces = fc.length / 3;
    const sample = [...Array(1600)].map(() => Math.floor(rnd() * nFaces));
    const nearest = new Float32Array(sample.length).fill(Infinity);
    const seeds = [];
    let cur = sample[0];
    for (let s = 0; s < k; s++) {
      seeds.push(cur);
      let best = -1, next = cur;
      sample.forEach((f, i) => {
        nearest[i] = Math.min(nearest[i], dist2(fc, f, cur));
        if (nearest[i] > best) {
          best = nearest[i];
          next = f;
        }
      });
      cur = next;
    }
    return seeds;
  }

  function nearestSeed(fc, seeds) {
    const nFaces = fc.length / 3;
    assert(seeds.length <= 256, 'shard ids are stored in a Uint8Array'); // more than 256 shards would wrap silently
    const shardOf = new Uint8Array(nFaces);
    for (let f = 0; f < nFaces; f++) {
      let best = Infinity;
      for (let j = 0; j < seeds.length; j++) {
        const d = dist2(fc, f, seeds[j]);
        if (d < best) {
          best = d;
          shardOf[f] = j;
        }
      }
    }
    return shardOf;
  }

  function shardCentres(fc, shardOf, k) {
    const sum = new Float32Array(k * 3), count = new Float32Array(k);
    for (let f = 0; f < shardOf.length; f++) {
      const j = shardOf[f];
      count[j]++;
      for (let a = 0; a < 3; a++) sum[3 * j + a] += fc[3 * f + a];
    }
    return [...Array(k)].map((_, j) => {
      assert(count[j] > 0, `shard ${j} received no faces`); // a seed is always its own nearest face
      return V(sum[3 * j] / count[j], sum[3 * j + 1] / count[j], sum[3 * j + 2] / count[j]);
    });
  }

  /**
   * How one shard moves as its lobe opens. It drifts mostly away from the lobe's own centre (so
   * the lobe opens like a flower), partly outwards from the brain (so the pieces clear the rest of
   * it), with a random part so the motion doesn't look mechanical; it drifts 0.2 to 0.36 brain
   * radii. It spins up to about two radians about a random axis, and starts with a delay of up to
   * 0.35 of the opening, so the shards don't move in lockstep.
   * The rnd() calls must stay in this order: the seeded sequence is what makes every visit the same.
   */
  function shardMotion(c, lc, outward) {
    const jitter = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.3);
    const drift = c.clone().sub(lc).normalize().multiplyScalar(0.75)
      .add(outward.clone().multiplyScalar(0.55))
      .add(jitter)
      .normalize().multiplyScalar(radius * (0.2 + 0.16 * rnd()));
    const axis = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
    const angle = (0.5 + rnd()) * 1.3 * (rnd() < 0.5 ? -1 : 1);
    return { c, drift, axis, angle, delay: rnd() * 0.35 };
  }

  // copy each shard's motion onto the three vertices of every face it owns, for the shader
  function writeShardAttributes(ng, shards, shardOf, nFaces) {
    const aC = new Float32Array(nFaces * 9), aD = new Float32Array(nFaces * 9);
    const aR = new Float32Array(nFaces * 12), aDl = new Float32Array(nFaces * 3);
    for (let f = 0; f < nFaces; f++) {
      const s = shards[shardOf[f]];
      for (let v = 0; v < 3; v++) {
        const i = 3 * f + v;
        aC.set([s.c.x, s.c.y, s.c.z], 3 * i);
        aD.set([s.drift.x, s.drift.y, s.drift.z], 3 * i);
        aR.set([s.axis.x, s.axis.y, s.axis.z, s.angle], 4 * i);
        aDl[i] = s.delay;
      }
    }
    ng.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
    ng.setAttribute('aD', new THREE.BufferAttribute(aD, 3));
    ng.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
    ng.setAttribute('aDl', new THREE.BufferAttribute(aDl, 1));
  }

  // 700 random surface points per lobe, pulled inwards: the x axis (left-right) far more than the
  // others, because the map is seen from the side and nodes on the surface would hide in profile
  function nodeCandidates(positions, centre) {
    const pool = [];
    const n = positions.length / 3;
    for (let i = 0; i < 700; i++) {
      const v = Math.floor(rnd() * n);
      pool.push(V(
        centre[0] + (positions[3 * v] - centre[0]) * INWARD_X,
        centre[1] + (positions[3 * v + 1] - centre[1]) * INWARD_YZ,
        centre[2] + (positions[3 * v + 2] - centre[2]) * INWARD_YZ));
    }
    return pool;
  }

  /**
   * Choose where each map node sits. Projects first, then methods and data, each picked from its
   * lobe's candidates to be as far as possible from the nodes already placed, minus a small pull
   * towards the lobe's centre. Distance is measured in the side view (z across, y up), and the
   * horizontal part counts 1/2.4 as much, because labels are wide and need more room sideways
   * than vertically. The cap of 0.24 radius stops the pull from pushing nodes to the rim.
   */
  function placeNodes(pools, centre) {
    const placed = [], at = [];
    const order = NODES.map((n, i) => i).sort((a, b) => (NODES[a][2] === 'p' ? 0 : 1) - (NODES[b][2] === 'p' ? 0 : 1));
    for (const i of order) {
      const L = NODES[i][3];
      const pool = pools[L] && pools[L].length ? pools[L] : pools[0];
      const lc = lobeCentre[L] || lobeCentre[0];
      // the lobe centre is pulled in by the same amount as the candidates, so the pull towards it stays inside the lobe
      const cz = centre[2] + (lc.z - centre[2]) * INWARD_YZ, cy = centre[1] + (lc.y - centre[1]) * INWARD_YZ;
      let best = -Infinity, choice = pool[0];
      for (const q of pool) {
        let gap = 0.24 * radius;
        for (const p of placed) gap = Math.min(gap, Math.max(Math.abs(q.z - p.z) / 2.4, Math.abs(q.y - p.y)));
        const score = gap - 0.1 * Math.hypot(q.z - cz, q.y - cy);
        if (score > best) {
          best = score;
          choice = q;
        }
      }
      placed.push(choice);
      at[i] = choice;
    }
    return at;
  }

  function buildMap(pools, centre) {
    const at = placeNodes(pools, centre);
    const ring = { p: COL.brown, m: COL.teal, d: COL.plum };
    nodes = NODES.map((n, i) => {
      const kind = n[2];
      const r = (kind === 'p' ? 0.05 : 0.032) * radius;
      const fill = kind === 'p' ? COL.brown : COL.cream;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), new THREE.MeshStandardMaterial({
        color: fill, roughness: 0.5, emissive: new THREE.Color(ring[kind]), emissiveIntensity: kind === 'p' ? 0.15 : 0.05, transparent: true,
      }));
      if (kind !== 'p') {
        // methods and data are cream spheres with a coloured rim: a slightly larger back-face sphere
        const halo = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), new THREE.MeshBasicMaterial({ color: ring[kind], transparent: true, opacity: 1, side: THREE.BackSide }));
        halo.scale.setScalar(1.28);
        m.add(halo);
        m.userData.halo = halo;
      }
      m.position.copy(at[i]);
      mapGroup.add(m);
      return { m, kind, r, x: 0, y: 0, rPx: 0, el: Site.makeLabel(labelLayer, `nl${kind === 'p' ? ' p' : ''}`) };
    });
    const curves = [];
    edges = EDGES.map(([a, b]) => {
      const A = at[a], B = at[b];
      const mid = A.clone().add(B).multiplyScalar(0.5);
      // bow each link outwards (and a little to the viewer's side) so links don't cut through nodes
      const ctrl = mid.clone().add(V(mid.x - centre[0], mid.y - centre[1], mid.z - centre[2]).multiplyScalar(0.22)).add(V(0.12 * radius, 0, 0));
      const curve = new THREE.QuadraticBezierCurve3(A, ctrl, B);
      curves.push(curve);
      return new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.006 * radius, 6, false), new THREE.MeshBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.6 }));
    });
    edges.forEach(e => mapGroup.add(e));
    mapPulses = pulsesAlong(curves);
    // drawn after the glass lobes (order 2), otherwise the overlapping lobe layers veil the nodes
    mapGroup.traverse(o => {
      o.renderOrder = 5;
      if (o.material) o.material.transparent = true;
    });
  }

  function pulsesAlong(curves) {
    const mat = new THREE.MeshBasicMaterial({ color: COL.caramel });
    const list = curves.map((curve, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.014 * radius, 10, 8), mat);
      mapGroup.add(m);
      return { m, curve, offset: i / curves.length };
    });
    return t => list.forEach(p => {
      const u = RM ? 0.5 : (t * 0.16 + p.offset) % 1;
      p.m.position.copy(p.curve.getPoint(u));
      p.m.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u)));
    });
  }

  // every 3D label follows the page language; diagram labels shorten on phones, where width is scarce
  function relabel() {
    diagrams.forEach(d => d.els.forEach(L => { L.el.textContent = Site.lang() === 'zh' ? L.zh : narrow ? L.short : L.full; }));
    nodes.forEach((n, i) => { n.el.textContent = Site.tr(NODES[i][0], NODES[i][1]); });
    hideCard();
  }
  Site.onLanguage(relabel);


  const heroText = document.querySelector('.hero .live');
  const areas = [...document.querySelectorAll('.area')];
  const areaText = areas.map(a => a.querySelector('.live'));
  const connections = document.getElementById('connections');
  const sheet = document.querySelector('.sheet');

  /**
   * Read the page's scroll position as scene inputs.
   *
   * weight[L] (0 to 1) says how open lobe L should be: it follows the section whose data-lobe is L
   * as it crosses the focus line. focus is the lobe whose section is under the focus line (or -1).
   * toMap (0 to 1) rises as "How my work connects" scrolls up to the top of the screen. covered is
   * the paper sheet's top edge: at or above 0 it hides the canvas entirely.
   * Side effects: on phones the text cards fade with their lobe (they sit over the brain); on wide
   * screens the section being read gets the accent line instead, because fading text hurt contrast.
   */
  function readScroll() {
    const line = vh * (narrow ? FOCUS_LINE_NARROW : FOCUS_LINE_WIDE);
    const weight = [0, 0, 0];
    let focus = -1;
    areas.forEach((a, i) => {
      const L = +a.dataset.lobe;
      const box = a.getBoundingClientRect();
      const p = (line - box.top) / box.height; // 0 when the section reaches the line, 1 when it leaves
      if (p >= 0 && p < 1) focus = L;
      weight[L] = sst(0, RAMP, p) * (1 - sst(1 - RAMP, 1, p));
      areaText[i].style.opacity = narrow ? Math.min(1, weight[L] * 2.2).toFixed(3) : '';
      a.classList.toggle('on', weight[L] > 0.35);
    });
    // on phones the opening lines scroll up under the brain, so they fade on the way
    heroText.style.opacity = narrow ? (1 - sst(vh * 0.12, vh * 0.34, scrollY)).toFixed(3) : '';
    return {
      weight, focus,
      toMap: sst(vh * 0.85, vh * 0.1, connections.getBoundingClientRect().top),
      covered: sheet.getBoundingClientRect().top <= 0,
    };
  }


  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let mouse = null, mouseMoved = false, drag = null, hover = -1, nodeFocus = -1, pinned = -1, tapTimer = 0;
  let rotY = START_YAW, rotX = 0.05;

  canvas.addEventListener('pointermove', e => {
    // a finger that isn't dragging is scrolling the page; we leave it alone
    if (e.pointerType === 'touch' && !drag) return;
    mouse = { x: e.clientX, y: e.clientY };
    mouseMoved = true;
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) drag.moved = true;
    rotY = drag.rotY + (e.clientX - drag.x) * 0.008;
    // tilting is mouse-only: on a phone a vertical drag means scroll, never tilt
    if (e.pointerType === 'mouse') rotX = Math.max(-0.6, Math.min(0.6, drag.rotX + (e.clientY - drag.y) * 0.005));
  });
  canvas.addEventListener('pointerleave', e => {
    // touch fires pointerleave right after every tap, which would close the tooltip it just opened
    if (e.pointerType === 'touch') return;
    mouse = null;
    hover = -1;
    nodeFocus = pinned;
  });
  canvas.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, rotY, rotX, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointerup', e => {
    if (drag && !drag.moved) {
      if (mapMix > 0.5) {
        // a click on a node pins its links; a second click on it, or on empty space, unpins
        const n = nearestNode(e.clientX, e.clientY);
        pinned = n === pinned ? -1 : n;
        nodeFocus = pinned;
      } else if (e.pointerType !== 'mouse') {
        // a tap opens the same tooltip a mouse would show on hover, and closes by itself
        mouse = { x: e.clientX, y: e.clientY };
        mouseMoved = true;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => { mouse = null; }, 3500);
      }
    }
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  addEventListener('scroll', () => { if (Site.TOUCH) mouse = null; }, { passive: true });

  // nodes are small on a phone, so the hit area is never less than 20 px around the centre
  function nearestNode(x, y) {
    let best = -1, bestD = Infinity;
    nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < Math.max(20, n.rPx + 12) && d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function showCard(key, title, text, x, y) {
    if (cardKey !== key) {
      card.querySelector('b').textContent = title;
      card.querySelector('span').textContent = text;
      card.classList.add('on');
      cardKey = key;
    }
    // keep the card on screen and below the top bar
    card.style.left = `${Math.max(8, Math.min(vw - 272, x + 18))}px`;
    card.style.top = `${Math.max(60, Math.min(vh - 110, y - 74))}px`;
  }

  function hideCard() {
    if (!cardKey) return;
    card.classList.remove('on');
    cardKey = null;
  }


  let mapMix = 0;              // 0 beside the text, 1 as the glass map
  const explode = [0, 0, 0];   // how open each research lobe is, smoothed
  let running = false, last = 0, frameTimes = [], judged = false, posterGone = false;
  const tmpA = V(0, 0, 0), tmpB = V(0, 0, 0);

  function toScreen(v) {
    tmpB.copy(v).project(camera);
    return { x: ((tmpB.x + 1) / 2) * vw, y: ((1 - tmpB.y) / 2) * vh };
  }

  function judgeSpeed(rawMs) {
    if (judged || loadedAt < 0 || rawMs <= 0 || rawMs >= STALE_FRAME_MS) return;
    frameTimes.push(rawMs);
    if (frameTimes.length < FRAMES_TO_JUDGE) return;
    judged = true;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    if (avg > SLOW_FRAME_MS && pixelRatio > 1) {
      pixelRatio = 1;
      renderer.setPixelRatio(1);
      resize();
      console.info(`brain: ${avg.toFixed(0)} ms per frame, rendering at 1x`);
    }
  }

  // place and scale the brain between its two poses, and return world units per mesh unit
  function poseBrain() {
    const m = ease(Math.min(1, mapMix));
    const a = Site.place(false, vw, vh), b = Site.place(true, vw, vh);
    const x = lerp(a.x, b.x, m), y = lerp(a.y, b.y, m), r = lerp(a.r, b.r, m);
    world.position.set((x - vw / 2) / pxPerUnit, -(y - vh / 2) / pxPerUnit, 0);
    const scale = r / (pxPerUnit * radius);
    world.scale.setScalar(scale);
    return { m, scale };
  }

  function turnBrain(state, t, dt) {
    let target = null;
    if (mapMix > 0.5) target = MAP_YAW + (RM ? 0 : 0.3 * Math.sin(t * 0.2));
    else if (state.focus >= 0) target = FOCUS_YAW[state.focus];
    if (drag) return;
    if (target !== null) {
      // shortest way round, so the brain never spins a full turn to reach a nearby angle
      const d = Math.atan2(Math.sin(target - rotY), Math.cos(target - rotY));
      rotY += d * Math.min(1, dt * 2.2);
      rotX += ((mapMix > 0.5 ? 0.02 : 0.08) - rotX) * Math.min(1, dt * 2.2);
    } else if (!RM && hover < 0 && !cardKey) {
      rotY += dt * AUTO_SPIN;
    }
  }

  function paintLobes(state, m, t, dt) {
    const k = Math.min(1, dt * 4);
    for (const mesh of lobes) {
      const u = mesh.userData;
      const inFocus = u.L === state.focus && mapMix < 0.5;
      const hovered = u.L === hover;
      u.lift += ((hovered && !inFocus ? 0.05 * radius : 0) - u.lift) * k;
      mesh.position.copy(u.dir).multiplyScalar(u.lift);
      // the lobe being read takes its area's colour and the others go pale; in the map all turn to glass
      const color = mapMix > 0.5 ? GLASS : inFocus || hovered ? u.color : state.focus >= 0 ? PALE : BASE;
      mesh.material.color.lerp(color, k);
      mesh.material.emissive.lerp((inFocus || hovered) && mapMix < 0.5 ? u.glow : BLACK, k);
      mesh.material.opacity = 1 - (1 - GLASS_OPACITY) * m;
      // depth writes off once see-through, otherwise the front lobes would hide the ones behind
      mesh.material.depthWrite = m < 0.35;
      mesh.material.side = u.uniforms && m < 0.35 ? THREE.DoubleSide : THREE.FrontSide;
      if (u.uniforms) {
        u.uniforms.explode.value = explode[u.L];
        u.uniforms.time.value = t;
      }
    }
  }

  /**
   * Raise each research lobe's diagram out of it, in front of the brain, and keep it on screen.
   * The card sits between the lobe and the brain's centre (42% of the way), 1.1 brain radii towards
   * the camera, so it floats clear of the shards. On wide screens we keep it out of the text column
   * (the left 46%); it pops in only after the shards have started moving (explode 0.25 to 0.9).
   */
  function placeDiagrams(scale, t) {
    const toCamera = tmpA.copy(camera.position).sub(world.position).normalize();
    diagrams.forEach((d, i) => {
      const pop = ease(sst(0.25, 0.9, explode[i]));
      d.g.visible = pop > 0.003 && !!lobeCentre[i];
      if (d.g.visible) {
        const at = lobeCentre[i].clone().applyMatrix4(pivot.matrixWorld).lerp(world.position, 0.42).addScaledVector(toCamera, 1.1 * radius * scale);
        const size = radius * scale * (narrow ? 0.95 : 0.72) * pop;
        d.g.position.copy(at);
        d.g.scale.setScalar(size);
        // the card is about 2 units wide, so its half width on screen is about `size` world units
        const perspective = CAMERA_Z / (CAMERA_Z - at.z);
        const halfPx = size * pxPerUnit * perspective;
        const cx = vw / 2 + at.x * pxPerUnit * perspective;
        const left = narrow ? 12 : Math.min(vw * 0.46, vw - 12 - 2 * halfPx);
        const nx = Math.min(vw - 12 - halfPx, Math.max(left + halfPx, cx));
        d.g.position.x += (nx - cx) / (pxPerUnit * perspective);
        d.g.rotation.set(0.12, (RM ? 0 : 0.2 * Math.sin(t * 0.4)) - 0.12, 0);
        d.update(t);
        d.g.updateMatrixWorld(true);
      }
      const show = sst(0.65, 1, explode[i]);
      d.els.forEach(L => {
        if (show < 0.01 || !d.g.visible) {
          L.el.style.opacity = 0;
          return;
        }
        const p = toScreen(L.p.clone().applyMatrix4(d.g.matrixWorld));
        L.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
        L.el.style.opacity = show;
      });
    });
  }

  // which diagram hot spot is under the pointer, if any; only once a diagram is nearly fully open
  function hotSpotUnderPointer() {
    if (!mouse || drag || mapMix >= 0.3) return null;
    let hit = null;
    diagrams.forEach((d, i) => {
      if (!d.g.visible || explode[i] < 0.8) return;
      const size = d.g.scale.x;
      d.hots.forEach((h, j) => {
        tmpB.copy(h.p).applyMatrix4(d.g.matrixWorld);
        const perspective = CAMERA_Z / (CAMERA_Z - tmpB.z);
        const p = toScreen(tmpB);
        const dist = Math.hypot(p.x - mouse.x, p.y - mouse.y) / (h.r * size * pxPerUnit * perspective);
        if (dist < 1 && (!hit || dist < hit.dist)) hit = { dist, h, key: `h${i}.${j}` };
      });
    });
    return hit;
  }

  function updatePointer() {
    const opened = Math.max(...explode) > 0.3;
    // lobe names make no sense once a diagram covers the lobe or the brain has become the map
    if (cardKey && cardKey[0] === 'l' && (mapMix >= 0.3 || opened)) {
      hideCard();
      hover = -1;
    }
    const hit = hotSpotUnderPointer();
    if (hit) {
      hover = -1;
      showCard(hit.key, Site.tr(...hit.h.title), Site.tr(...hit.h.text), mouse.x, mouse.y);
    } else {
      if (cardKey && cardKey[0] === 'h') {
        hideCard();
        mouseMoved = true; // the pointer may now be over a lobe; check on this frame
      }
      if (!mouse) {
        hover = -1;
        hideCard();
      } else if (mouseMoved && !drag) {
        mouseMoved = false;
        if (mapMix < 0.3 && !narrow && !opened && lobes.length) {
          ndc.set((mouse.x / vw) * 2 - 1, -(mouse.y / vh) * 2 + 1);
          ray.setFromCamera(ndc, camera);
          // the raycast sees the unexploded surface, which is right here: only closed lobes are hoverable
          const first = ray.intersectObjects(lobes)[0];
          hover = first ? first.object.userData.L : -1;
          if (hover >= 0) {
            const lobe = LOBES[hover];
            showCard(`l${hover}`, Site.tr(lobe.en, lobe.zh), Site.tr(lobe.infoEn, lobe.infoZh), mouse.x, mouse.y);
          } else hideCard();
        } else {
          hover = -1;
          hideCard();
          if (mapMix > 0.5 && pinned < 0) nodeFocus = nearestNode(mouse.x, mouse.y);
        }
      }
    }
    if (mapMix < 0.3 && pinned >= 0) {
      pinned = -1;
      nodeFocus = -1;
    }
  }

  function updateMap(scale, t) {
    mapGroup.visible = mapMix > 0.01 && nodes.length > 0;
    if (!nodes.length) return;
    const linked = new Set();
    if (nodeFocus >= 0) {
      linked.add(nodeFocus);
      EDGES.forEach(([a, b]) => {
        if (a === nodeFocus) linked.add(b);
        if (b === nodeFocus) linked.add(a);
      });
    }
    const labelShow = sst(0.6, 0.95, mapMix);
    nodes.forEach((n, i) => {
      // nodes grow in one after another as the brain arrives
      n.m.scale.setScalar(Math.max(0.001, sst(0.3 + i * 0.012, 0.75 + i * 0.012, mapMix)));
      const dim = nodeFocus >= 0 && !linked.has(i);
      n.m.material.opacity = dim ? 0.28 : 1;
      if (n.m.userData.halo) n.m.userData.halo.material.opacity = dim ? 0.28 : 1;
      n.m.getWorldPosition(tmpB);
      const p = toScreen(tmpB);
      n.x = p.x;
      n.y = p.y;
      n.rPx = n.r * scale * pxPerUnit * 1.1;
      // phones show project names only, until a tap reveals one node's neighbours, because all 19 overlap
      const opacity = labelShow * (dim ? 0.22 : 1) * (narrow && n.kind !== 'p' && !linked.has(i) ? 0 : 1);
      n.el.style.opacity = opacity;
      if (opacity > 0.01) n.el.style.transform = `translate(${p.x}px, ${p.y + n.rPx + 4}px) translate(-50%, 0)`;
    });
    const focusKind = nodeFocus >= 0 ? NODES[nodeFocus][2] : null;
    const linkColor = focusKind === 'p' ? COL.caramel : focusKind === 'm' ? COL.teal : COL.plum;
    edges.forEach((e, j) => {
      const [a, b] = EDGES[j];
      const hit = nodeFocus >= 0 && (a === nodeFocus || b === nodeFocus);
      e.material.opacity = (nodeFocus < 0 ? 0.6 : hit ? 1 : 0.1) * sst(0.35, 0.85, mapMix);
      e.material.color.set(hit ? linkColor : COL.edge);
    });
    if (mapPulses) mapPulses(t);
  }

  function frame(now) {
    const rawMs = now - last;
    const dt = Math.min(0.05, rawMs / 1000 || 0.016); // capped, so a stalled tab does not jump the animation
    last = now;
    const t = now / 1000;
    const state = readScroll();
    if (state.covered) {
      // the paper sheet hides the canvas: stop until the visitor scrolls back up (see kick)
      running = false;
      labelLayer.style.visibility = 'hidden';
      hideCard();
      return;
    }
    labelLayer.style.visibility = '';
    judgeSpeed(rawMs);
    mapMix += (state.toMap - mapMix) * Math.min(1, dt * 5);
    for (let i = 0; i < explode.length; i++) explode[i] += (state.weight[i] * (1 - state.toMap) - explode[i]) * Math.min(1, dt * 3.2);
    const { m, scale } = poseBrain();
    turnBrain(state, t, dt);
    spin.rotation.set(rotX, rotY, 0);
    world.visible = loadedAt >= 0;
    paintLobes(state, m, t, dt);
    scene.updateMatrixWorld();
    placeDiagrams(scale, t);
    updatePointer();
    updateMap(scale, t);
    renderer.render(scene, camera);
    retirePoster();
    requestAnimationFrame(frame);
  }

  // the still image stays until the first real frame of the 3D brain, then fades out
  function retirePoster() {
    if (loadedAt < 0 || posterGone) return;
    posterGone = true;
    removeEventListener('scroll', fadePosterOnScroll);
    if (!poster) return;
    poster.style.opacity = 0;
    setTimeout(() => poster.remove(), 700);
  }

  // until then the still image scrolls away like the brain would
  function fadePosterOnScroll() {
    if (poster && poster.isConnected) poster.style.opacity = (1 - sst(innerHeight * 0.15, innerHeight * 0.45, scrollY)).toFixed(3);
  }
  addEventListener('scroll', fadePosterOnScroll, { passive: true });
  fadePosterOnScroll();

  function kick() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', () => {
    kick();
    relabel();
  });
  kick();


  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
    } catch (e) {
      // some locked-down browsers throw instead of returning null; either way there is no WebGL
      return false;
    }
  }

  /**
   * Show the page without 3D: the still brain image stays in the hero, and the connection map
   * appears as its text list (CSS keys off the no3d class). We say why in the console, because a
   * silent fallback would make a broken model file look like an old phone.
   */
  function useFallback(reason) {
    console.warn(`brain: showing the still version (${reason})`);
    document.documentElement.classList.add('no3d');
  }
})();
