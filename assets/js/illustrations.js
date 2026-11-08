/* The three small 3D diagrams that rise out of an opened lobe, one per research area.
   Each is drawn in its own unit frame (about x in [-1, 1], y in [-0.66, 0.56]) on a floating
   card; brain.js places, scales and turns the card. They show how a project works, never its
   results, because both manuscripts are still under review. */
(function () {
  'use strict';
  const Site = window.Site;
  const { sst, RM, COLORS: COL } = Site;
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  // card size in the unit frame; every diagram is laid out to fit inside it
  const CARD_W = 1.98, CARD_H = 1.22, CARD_R = 0.09, CARD_BOTTOM = -0.66;
  // the card sits behind the parts by this much, so they cast no z-fighting against it
  const CARD_Z = -0.24;
  // drawn after the brain (renderOrder 2) so a shard behind the card never shows through it
  const CARD_ORDER = 6;

  // a small kit of parts, so the three diagrams share one visual language
  const std = (color, opts) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0 }, opts || {}));

  function box(g, w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, opts));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  // a translucent layer with drawn edges: reads as "a model layer" at any size
  function slab(g, w, h, d, color, opacity, edge, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, std(color, { transparent: true, opacity, roughness: 0.35 }));
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: edge })));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  function ball(g, r, color, x, y, z, glow) {
    const opts = glow ? { emissive: new THREE.Color(color), emissiveIntensity: 0.3 } : {};
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), std(color, opts));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }

  function tube(g, curve, r, color, opacity) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, r, 6, false), mat);
    g.add(m);
    return m;
  }

  const spline = (...pts) => new THREE.CatmullRomCurve3(pts);
  const arc = (a, b, h) => new THREE.QuadraticBezierCurve3(a, V((a.x + b.x) / 2, Math.max(a.y, b.y) + h, (a.z + b.z) / 2), b);

  /**
   * Small spheres that travel along curves, one per curve, to show data flowing.
   * They grow from nothing and shrink back at the ends (sin of the position along the curve),
   * so a pulse never pops into existence. With reduced motion they rest at the middle.
   *
   * @returns {function(number): void} call with the time in seconds every frame
   */
  function pulses(g, curves, color, r, speed) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const list = curves.map((curve, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      g.add(m);
      return { m, curve, offset: i / curves.length };
    });
    return t => list.forEach(p => {
      const u = RM ? 0.5 : (t * speed + p.offset) % 1;
      p.m.position.copy(p.curve.getPoint(u));
      p.m.scale.setScalar(Math.max(0.001, Math.sin(Math.PI * u)));
    });
  }

  // a hot spot: point at it (or tap it) to read what that part of the diagram is
  const hot = (x, y, r, titleEn, titleZh, textEn, textZh) => ({ p: V(x, y), r, title: [titleEn, titleZh], text: [textEn, textZh] });

  // 01 (occipital): papers -> an LLM reading tokens with attention -> a knowledge graph
  function llmDiagram() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const sheet = slab(g, 0.2, 0.26, 0.006, COL.cream, 1, '#C9AD8C', -0.76 + i * 0.035, 0.05 - i * 0.03, -0.06 + i * 0.05);
      sheet.rotation.z = 0.08 * (1 - i);
      if (i === 2) {
        // lines of text on the top sheet; the first is a plum title line
        for (let l = 0; l < 7; l++) {
          const w = l === 0 ? 0.09 : 0.14 - (l % 3) * 0.025;
          const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.011, 0.002), std(l === 0 ? COL.plum : COL.ink2));
          line.position.set(-0.07 + w / 2, 0.09 - l * 0.03, 0.005);
          sheet.add(line);
        }
      }
    }
    const tokenColors = ['#8C5A86', '#9D6C97', '#7A4C75', '#A47A9F', '#8C5A86', '#764670'];
    const tx = i => -0.38 + i * 0.085;
    for (let i = 0; i < 6; i++) box(g, 0.055, 0.055, 0.055, tokenColors[i], tx(i), -0.14, 0);
    // attention arcs between tokens up to three apart; nearer pairs are drawn stronger
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6 && j - i <= 3; j++) {
        tube(g, arc(V(tx(i), -0.11), V(tx(j), -0.11), 0.04 + 0.055 * (j - i)), 0.0032, COL.plum, 0.3 + 0.12 * (4 - (j - i)));
      }
    }
    const graph = new THREE.Group();
    graph.position.set(0.62, 0.03, 0);
    g.add(graph);
    const nodePos = [[0, 0, 0], [0.17, 0.12, 0.05], [-0.12, 0.16, -0.06], [0.14, -0.15, 0.08], [-0.16, -0.12, 0.04], [0.25, -0.01, -0.08], [0.02, 0.24, 0.1]];
    const nodeColors = [COL.plum, COL.teal, COL.caramel, COL.plum, COL.teal, COL.caramel, COL.plum];
    nodePos.forEach((p, i) => ball(graph, i ? 0.03 : 0.042, nodeColors[i], p[0], p[1], p[2], true));
    [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [3, 5], [2, 6], [1, 6], [4, 3]].forEach(([a, b]) =>
      tube(graph, new THREE.LineCurve3(V(...nodePos[a]), V(...nodePos[b])), 0.005, COL.brown, 0.6));
    const toTokens = spline(V(-0.6, -0.04), V(-0.5, -0.12), V(-0.42, -0.14));
    const toGraph = spline(V(0.1, -0.14), V(0.26, -0.1), V(0.44, -0.02));
    tube(g, toTokens, 0.006, COL.brown, 0.55);
    tube(g, toGraph, 0.006, COL.brown, 0.55);
    const flow = pulses(g, [toTokens, toGraph], COL.plum, 0.017, 0.45);
    return {
      g,
      hots: [
        hot(-0.72, 0.03, 0.16, 'Biomedical papers', '生物医学文献', 'The literature the LLM reads.', '大模型阅读的文献。'),
        hot(-0.17, -0.14, 0.12, 'LLM', '大语言模型', 'Reads each passage and extracts the relationships it reports.', '阅读文本并抽取其中报道的关系。'),
        hot(-0.17, 0.03, 0.1, 'Attention', '注意力', 'How the model links words across a sentence.', '模型如何在句子中关联词语。'),
        hot(0.62, 0.03, 0.27, 'Knowledge graph', '知识图谱', 'Entities and relations, each checked against the data.', '实体与关系，逐条用数据核验。'),
      ],
      labels: [['papers', 'papers', '文献', V(-0.71, -0.25)], ['LLM', 'LLM', '大模型', V(-0.17, -0.3)], ['knowledge graph', 'graph', '知识图谱', V(0.62, -0.36)]],
      update(t) {
        flow(t);
        if (!RM) graph.rotation.y = t * 0.35;
      },
    };
  }

  // 02 (temporal): a patient's history -> a GPT inside a differential-privacy shell -> synthetic records
  function privacyDiagram() {
    const g = new THREE.Group();
    const tokenColors = ['#2C7A74', '#3E8F88', '#5BA39C', '#2C7A74', '#4A958E', '#367F79'];
    const tx = i => -0.86 + i * 0.08;
    for (let i = 0; i < 6; i++) box(g, 0.058, 0.058, 0.058, tokenColors[i], tx(i), -0.08, 0);
    // causal attention: each event links only to the (up to three) events before it, never ahead
    for (let j = 1; j < 6; j++) {
      for (let i = Math.max(0, j - 3); i < j; i++) tube(g, arc(V(tx(i), -0.05), V(tx(j), -0.05), 0.035 + 0.055 * (j - i)), 0.0035, COL.teal, 0.55);
    }
    for (let i = 0; i < 4; i++) slab(g, 0.028, 0.56, 0.3, COL.cream, 0.86, COL.teal, -0.12 + i * 0.08, 0, 0);
    const shell = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.4, 1)),
      new THREE.LineBasicMaterial({ color: COL.teal, transparent: true, opacity: 0.5 }));
    g.add(shell);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.39, 32, 16), new THREE.MeshBasicMaterial({ color: COL.teal, transparent: true, opacity: 0.07, depthWrite: false })));
    const into = spline(V(-0.44, -0.08), V(-0.3, -0.06), V(-0.17, 0));
    const out = spline(V(0.17, 0), V(0.32, -0.06), V(0.47, -0.08));
    tube(g, into, 0.006, COL.brown, 0.55);
    tube(g, out, 0.006, COL.brown, 0.55);
    const generated = [0, 1, 2].map(i => slab(g, 0.058, 0.058, 0.058, COL.cream, 0.95, COL.teal, 0.53 + i * 0.085, -0.08, 0));
    const flow = pulses(g, [into, out], COL.teal, 0.018, 0.5);
    return {
      g,
      hots: [
        hot(-0.66, -0.08, 0.13, 'Disease history', '疾病史', 'Diagnosis codes (ICD-10) in time order, one patient at a time.', '按时间顺序排列的诊断编码（ICD-10）。'),
        hot(-0.66, 0.1, 0.09, 'Causal attention', '因果注意力', 'Each event can only look at the events before it.', '每个事件只能关注它之前的事件。'),
        hot(0, 0, 0.38, 'Differential privacy', '差分隐私',
          'Training clips and adds noise to each patient\'s contribution (DP-SGD), limiting what the model can memorise about anyone.',
          '训练时对每位患者的贡献进行裁剪并加入噪声（DP-SGD），限制模型对任何个人的记忆。'),
        hot(0.62, -0.08, 0.13, 'Synthetic records', '合成病历', 'New disease histories sampled from the trained model.', '从训练好的模型中采样的新疾病史。'),
      ],
      labels: [['patient history', 'history', '疾病史', V(-0.66, -0.27)], ['private GPT', 'private GPT', '隐私 GPT', V(0, -0.5)], ['synthetic records', 'synthetic', '合成病历', V(0.62, -0.27)]],
      update(t) {
        flow(t);
        if (!RM) {
          shell.rotation.y = t * 0.25;
          shell.rotation.x = t * 0.11;
        }
        // the three generated records appear one after another, like tokens being sampled
        const phase = RM ? 0.6 : (t * 0.45) % 1;
        generated.forEach((m, i) => m.scale.setScalar(Math.max(0.001, sst(i * 0.2, i * 0.2 + 0.12, phase) * (1 - sst(0.86, 1, phase)))));
      },
    };
  }

  // 03 (frontal): omics and MRI -> a multimodal model -> nine symptom outputs
  function omicsDiagram() {
    const g = new THREE.Group();
    const rows = [0.27, 0.09, -0.09, -0.27];
    const rowColors = [COL.caramel, COL.olive, COL.plum, COL.teal];
    rows.forEach((y, r) => { for (let i = 0; i < 4; i++) box(g, 0.055, 0.055, 0.055, rowColors[r], -0.86 + i * 0.075, y, 0); });
    for (let i = 0; i < 4; i++) slab(g, 0.028, 0.66, 0.34, COL.cream, 0.82, COL.caramel, -0.13 + i * 0.087, 0, 0);
    const inputs = rows.map(y => spline(V(-0.6, y), V(-0.38, y * 0.8), V(-0.16, y * 0.45)));
    inputs.forEach(c => tube(g, c, 0.006, COL.brown, 0.55));
    const symptomY = [...Array(9)].map((_, j) => 0.4 - j * 0.1);
    const symptoms = symptomY.map(y => ball(g, 0.03, COL.caramel, 0.64, y, 0, true));
    const outputs = symptomY.map(y => spline(V(0.16, y * 0.4), V(0.38, y * 0.8), V(0.6, y)));
    outputs.forEach(c => tube(g, c, 0.0045, COL.brown, 0.45));
    const flowIn = pulses(g, inputs, COL.caramel, 0.017, 0.42);
    const flowOut = pulses(g, outputs, COL.caramel, 0.012, 0.42);
    return {
      g,
      hots: [
        hot(-0.75, 0.27, 0.075, 'Plasma proteins', '血浆蛋白质', 'Olink proteomics from blood samples.', '来自血液样本的 Olink 蛋白质组数据。'),
        hot(-0.75, 0.09, 0.075, 'Metabolites', '代谢物', 'NMR metabolomics from blood samples.', '来自血液样本的 NMR 代谢组数据。'),
        hot(-0.75, -0.09, 0.075, 'Genetics', '遗传', 'Polygenic risk scores.', '多基因风险评分。'),
        hot(-0.75, -0.27, 0.075, 'Brain MRI', '脑 MRI', 'Structural, diffusion and functional imaging features.', '结构、弥散与功能影像特征。'),
        hot(0, 0, 0.24, 'Multimodal model', '多模态模型', 'Learns from all four data types together, with a separate output for each symptom.', '同时学习四类数据，并为每项症状单独输出。'),
        ...symptomY.map((y, j) => hot(0.64, y, 0.048, `PHQ-9 item ${j + 1}`, `PHQ-9 第 ${j + 1} 项`, Site.PHQ9[j][0], Site.PHQ9[j][1])),
      ],
      labels: [['omics + MRI', 'omics + MRI', '组学 + MRI', V(-0.75, -0.4)], ['multimodal model', 'model', '多模态模型', V(0, -0.45)], ['9 symptoms', '9 symptoms', '9 项症状', V(0.64, -0.52)]],
      update(t) {
        flowIn(t);
        flowOut(t);
        // a wave of glow runs down the nine outputs, so they read as nine separate predictions
        symptoms.forEach((m, j) => { m.material.emissiveIntensity = RM ? 0.4 : 0.2 + 0.8 * Math.max(0, Math.sin(t * 2.2 - j * 0.55)); });
      },
    };
  }

  // the floating card behind a diagram, with the area's colour as a bar along the top
  function addCard(g, accent) {
    const x0 = -CARD_W / 2, y0 = CARD_BOTTOM, r = CARD_R;
    const shape = new THREE.Shape();
    shape.moveTo(x0 + r, y0);
    shape.lineTo(x0 + CARD_W - r, y0);
    shape.quadraticCurveTo(x0 + CARD_W, y0, x0 + CARD_W, y0 + r);
    shape.lineTo(x0 + CARD_W, y0 + CARD_H - r);
    shape.quadraticCurveTo(x0 + CARD_W, y0 + CARD_H, x0 + CARD_W - r, y0 + CARD_H);
    shape.lineTo(x0 + r, y0 + CARD_H);
    shape.quadraticCurveTo(x0, y0 + CARD_H, x0, y0 + CARD_H - r);
    shape.lineTo(x0, y0 + r);
    shape.quadraticCurveTo(x0, y0, x0 + r, y0);
    // 74% opaque: enough to read the parts, while the opened lobe still shows through around them
    const face = new THREE.Mesh(new THREE.ShapeGeometry(shape, 6),
      new THREE.MeshBasicMaterial({ color: COL.cream, transparent: true, opacity: 0.74, toneMapped: false, depthWrite: false }));
    face.position.z = CARD_Z;
    g.add(face);
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(shape.getPoints(8)), new THREE.LineBasicMaterial({ color: '#D9BFA0', toneMapped: false }));
    outline.position.z = CARD_Z + 0.001;
    g.add(outline);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W - 0.5, 0.024), new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }));
    bar.position.set(0, y0 + CARD_H - 0.012, CARD_Z + 0.002);
    g.add(bar);
    g.traverse(o => { o.renderOrder = CARD_ORDER; });
  }

  /**
   * Create an HTML label in the label layer, positioned later by the frame loop.
   * Labels are HTML rather than 3D text so they stay sharp, translate, and can be read by the
   * browser's find-in-page; the layer is hidden from screen readers, which get connlist instead.
   */
  Site.makeLabel = (layer, cls) => {
    const el = document.createElement('div');
    el.className = `lab ${cls}`;
    layer.append(el);
    return el;
  };

  /**
   * Build the three diagrams, hidden, indexed by lobe (0 frontal, 1 temporal, 2 occipital).
   *
   * @param {THREE.Scene} scene   where the diagram groups are added
   * @param {HTMLElement} layer   where their HTML labels go
   * @returns {Array<{g: THREE.Group, hots: Array, els: Array, update: function(number): void}>}
   */
  Site.buildIllustrations = (scene, layer) => {
    const byLobe = [omicsDiagram(), privacyDiagram(), llmDiagram()];
    const accents = [COL.caramel, COL.teal, COL.plum];
    return byLobe.map((d, lobe) => {
      addCard(d.g, accents[lobe]);
      d.g.visible = false;
      scene.add(d.g);
      d.els = d.labels.map(([full, short, zh, p]) => ({ el: Site.makeLabel(layer, 'il'), p, full, short, zh }));
      return d;
    });
  };
})();
