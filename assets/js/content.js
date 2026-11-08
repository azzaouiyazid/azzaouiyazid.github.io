/* What the 3D scene says, in English and Chinese, kept apart from the code that draws it.
   The rest of the page text lives in index.html as paired .en/.zh spans. */
(function () {
  'use strict';
  const Site = window.Site;

  // index = region id in brain_lite.json. Lobes 0-2 carry the three research areas:
  // frontal = multimodal multi-omics, temporal = private generative AI, occipital = LLMs
  Site.LOBES = [
    { en: 'Frontal lobe', zh: '额叶', infoEn: 'Planning, decisions and keeping mood in check.', infoZh: '规划、决策与情绪调节。', color: '#B85C24' },
    { en: 'Temporal lobe', zh: '颞叶', infoEn: 'Memory, language and emotion.', infoZh: '记忆、语言与情绪。', color: '#2C7A74' },
    { en: 'Occipital lobe', zh: '枕叶', infoEn: 'Vision, and the first step of reading.', infoZh: '视觉，也是阅读的第一步。', color: '#8C5A86' },
    { en: 'Parietal lobe', zh: '顶叶', infoEn: 'Touch, space and attention.', infoZh: '触觉、空间与注意。', color: '#7A4A2C' },
    { en: 'Cerebellum', zh: '小脑', infoEn: 'Movement, balance and timing.', infoZh: '运动、平衡与节律。', color: '#7A8A36' },
    { en: 'Brainstem', zh: '脑干', infoEn: 'Sleep, breathing and alertness.', infoZh: '睡眠、呼吸与觉醒。', color: '#BE6054' },
    { en: 'Cingulate cortex', zh: '扣带皮层', infoEn: 'Emotion and attention.', infoZh: '情绪与注意。', color: '#A8662C' },
  ];

  // the nine PHQ-9 items, in questionnaire order, shown when someone points at a symptom sphere
  Site.PHQ9 = [
    ['Little interest or pleasure', '兴趣减退'], ['Feeling down or hopeless', '情绪低落或绝望'],
    ['Sleep problems', '睡眠问题'], ['Tiredness or low energy', '疲乏或精力不足'],
    ['Poor appetite or overeating', '食欲不振或暴食'], ['Feeling bad about yourself', '自我评价低'],
    ['Trouble concentrating', '注意力难以集中'], ['Moving slowly, or restless', '动作迟缓或坐立不安'],
    ['Thoughts of self-harm', '自伤念头'],
  ];

  // connection map: [english, chinese, kind, lobe]; kind p = project, m = method, d = data.
  // Each project sits in the lobe of its research area; methods and data go where they are used most.
  Site.NODES = [
    ['Thesis: nine symptoms', '硕士论文：九项症状', 'p', 0], ['Protein networks', '蛋白质网络', 'p', 3],
    ['AEGIS', 'AEGIS', 'p', 1], ['OHBM poster', 'OHBM 海报', 'p', 4],
    ['Gradient boosting', '梯度提升', 'm', 0], ['Graphical models', '图模型', 'm', 3],
    ['Transformers', 'Transformer', 'm', 1], ['Differential privacy', '差分隐私', 'm', 1],
    ['Language models', '语言模型', 'm', 2], ['Knowledge graphs', '知识图谱', 'm', 2],
    ['Survival analysis', '生存分析', 'm', 3], ['Permutation tests', '置换检验', 'm', 0],
    ['Membership inference', '成员推断', 'm', 1],
    ['Plasma proteomics', '血浆蛋白质组', 'd', 3], ['Metabolomics', '代谢组', 'd', 0],
    ['Brain MRI', '脑 MRI', 'd', 6], ['Health records', '电子病历', 'd', 1],
    ['Genetics', '遗传学', 'd', 0], ['Literature', '文献', 'd', 2],
  ];
  Site.EDGES = [
    [0, 4], [0, 8], [0, 9], [0, 11], [0, 13], [0, 14], [0, 15], [0, 17], [0, 18], [0, 2], [0, 1],
    [1, 5], [1, 10], [1, 11], [1, 13], [1, 15], [2, 6], [2, 7], [2, 12], [2, 16],
    [3, 13], [3, 15], [3, 1], [8, 9], [9, 18], [6, 8],
  ];

  // we check the hand-written graph here because a wrong index would only show up as a missing
  // line somewhere in the 3D map, which nobody would notice
  Site.EDGES.forEach(([a, b]) => Site.assert(a !== b && Site.NODES[a] && Site.NODES[b], `edge ${a}-${b} points outside NODES`));
  Site.NODES.forEach(n => Site.assert(Site.LOBES[n[3]] && 'pmd'.includes(n[2]), `node "${n[0]}" has kind ${n[2]} and lobe ${n[3]}`));
})();
