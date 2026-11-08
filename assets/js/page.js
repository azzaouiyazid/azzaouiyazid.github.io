/* Page behaviour that needs no 3D: the language switch, the phone menu, the top bar's rule,
   copying the email, and the text version of the connection map. That text version is what
   screen readers read, and what everyone sees when the browser has no WebGL. */
(function () {
  'use strict';
  const Site = window.Site;
  const root = document.documentElement;
  const relabelers = [];

  Site.lang = () => root.dataset.lang;

  /** The English or Chinese string, whichever matches the current page language. */
  Site.tr = (en, zh) => (Site.lang() === 'zh' ? zh : en);

  /** Register a function that redraws text living outside the .en/.zh spans (3D labels, lists). */
  Site.onLanguage = fn => relabelers.push(fn);

  /**
   * Switch the page language.
   *
   * CSS hides whichever of .en / .zh does not match html[data-lang], so we only set the attribute
   * and the title, then redraw the text that the 3D scene owns. We save the choice so the next
   * visit opens in the same language, even when the visitor's time zone would suggest the other.
   *
   * @param {'en'|'zh'} lang
   */
  function setLang(lang) {
    root.dataset.lang = lang;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = lang === 'zh' ? root.dataset.titleZh : root.dataset.titleEn;
    try {
      localStorage.setItem('lang', lang);
    } catch (e) {
      // private browsing refuses storage; the switch still works, it just isn't remembered
    }
    relabelers.forEach(fn => fn());
  }
  document.getElementById('langbtn').addEventListener('click', () => setLang(Site.lang() === 'zh' ? 'en' : 'zh'));

  function setupMenu() {
    const bar = document.getElementById('bar');
    const btn = document.getElementById('menubtn');
    const nav = document.getElementById('sitenav');
    const close = () => {
      bar.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };
    btn.addEventListener('click', () => btn.setAttribute('aria-expanded', String(bar.classList.toggle('open'))));
    // jumping to a section should not leave the menu covering it
    nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    // the rule under the bar appears only once something has scrolled beneath it
    addEventListener('scroll', () => bar.classList.toggle('scrolled', scrollY > 10), { passive: true });
  }

  function setupCopyEmail() {
    const btn = document.getElementById('copy');
    const email = document.getElementById('email');
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(email.textContent);
        btn.textContent = Site.tr('Copied', '已复制');
      } catch (e) {
        // the clipboard API needs https and permission, and WeChat's browser often refuses it;
        // we select the address instead and tell the visitor how to finish
        const range = document.createRange();
        range.selectNodeContents(email);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = Site.tr('Selected: press Ctrl+C', '已选中：按 Ctrl+C 复制');
      }
    });
  }

  /** Write the connection map as a list (projects and what they link to) in the current language. */
  function writeConnectionList() {
    const ul = document.getElementById('connlist');
    ul.textContent = '';
    Site.NODES.forEach((node, i) => {
      if (node[2] !== 'p') return;
      const links = Site.EDGES.filter(e => e.includes(i)).map(e => (e[0] === i ? e[1] : e[0]));
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = Site.tr(node[0], node[1]);
      const names = links.map(j => Site.tr(Site.NODES[j][0].toLowerCase(), Site.NODES[j][1]));
      li.append(b, Site.tr(': ', '：'), names.join(Site.tr(', ', '、')));
      ul.append(li);
    });
    document.getElementById('connhint').textContent = Site.TOUCH
      ? Site.tr('Tap a node to trace its links. Swipe sideways to turn the brain.', '点击节点查看关联，左右滑动可旋转大脑。')
      : Site.tr('Point at a node to trace its links. Drag to turn the brain.', '将鼠标移到节点上查看关联，拖动可旋转大脑。');
  }

  setupMenu();
  setupCopyEmail();
  writeConnectionList();
  Site.onLanguage(writeConnectionList);
})();
