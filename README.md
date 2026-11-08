# azzaouiyazid.github.io

Personal research site of Yazid Azzaoui: AI, large language models and multi-omics.
English and Chinese (中文) in one page; the default language follows the visitor's
time zone and browser language, and the EN / 中文 button switches it.

Everything the page needs is in this folder: fonts, the 3D library, the brain model,
images and CVs. Nothing loads from Google, cdnjs or any other outside service, so the
site works on networks inside mainland China.

---

## Publish it

This folder is already a git repository: everything is committed on the branch `main`, and its
remote `origin` points to `https://github.com/azzaouiyazid/azzaouiyazid.github.io.git`.

1. **Create the empty repository on GitHub.** Click **New repository**, name it exactly
   **`azzaouiyazid.github.io`**, make it **Public**, and do **not** add a README, .gitignore or
   licence (the repository must be empty, or the first push is refused).
2. **Push.** In Terminal:

   ```bash
   cd ~/Desktop/azzaouiyazid.github.io
   git push -u origin main
   ```

   GitHub asks you to sign in the first time (a browser window or a personal access token).
   GitHub Desktop works too: *File → Add Local Repository*, choose this folder, then *Publish*.
3. **Turn on Pages.** On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**,
   branch **main**, folder **/(root)**, **Save**.
4. **Wait 1 to 2 minutes**, then open **https://azzaouiyazid.github.io**.

Later changes: edit the files, then

```bash
git add -A
git commit -m "Describe the change"
git push
```

## Before you share the link

- [ ] Show the site to **Prof. Zhaowen Liu** (it describes the thesis and both manuscripts).
- [ ] Ask a native speaker to read the **Chinese version** once (`?lang=zh`).
- [ ] Test on real devices: an **iPhone**, an **Android phone**, inside **WeChat**
      (send the link to yourself), and on a **mainland network without a VPN**.
- [ ] Check that both CV buttons download the right file (English page → English CV,
      Chinese page → 中文简历).

## Updating the site

| To change | Edit |
|---|---|
| Any page text | `index.html`. Every sentence appears twice: `<span class="en">…</span>` and `<span class="zh">…</span>`. Change both. |
| Text inside the 3D scene (lobe names, map nodes, PHQ-9 items) | `assets/js/content.js` |
| Text on the three diagrams and their tooltips | `assets/js/illustrations.js` |
| A paper's status (e.g. accepted) | `index.html`, section `id="pubs"`, and the "2 manuscripts · under review" line near the top (`class="glance"`). Then rebuild the CVs (below). |
| The CVs | Edit `tools/cv/build_cv.py`, then run `python3 tools/cv/build_cv.py`. It writes both PDFs into `assets/cv/` and warns if one grows past two pages. Needs `pip install playwright pypdf` and `playwright install chromium` once. |
| Photos | Replace files in `assets/img/` with the same names and similar sizes. |
| Colours | `assets/css/site.css` (`:root`), and the same values in `assets/js/core.js` (`Site.COLORS`), which the 3D scene uses. |
| "Updated" date | Footer of `index.html`, `UPDATED` in `tools/cv/build_cv.py`, and `sitemap.xml`. |

After editing, upload the changed files again (or `git commit` and `git push`);
GitHub republishes within a minute or two.

## What's in the folder

```
index.html              the page: head, language pick, and all text (English + Chinese)
404.html                page shown for broken links
favicon.svg, favicon-32.png, apple-touch-icon.png
robots.txt, sitemap.xml, .nojekyll
assets/
  css/site.css          all styles; fonts are declared at the top
  js/layout.js          where the brain sits on screen; shared by the still image and the 3D scene
  js/core.js            small helpers (assert, easing) and the colour palette
  js/content.js         lobe names, PHQ-9 items, the connection graph, in both languages
  js/page.js            language switch, phone menu, copy email, text version of the map
  js/illustrations.js   the three diagrams that rise out of the lobes
  js/brain.js           the 3D scene: loading and checking the model, shards, map, scrolling, pointer
  js/three.min.js       3D library (three.js r149), unmodified
  fonts/                Source Sans 3 and Source Serif 4 (Latin); Chinese uses the visitor's system fonts
  data/brain_lite.json  3D brain model (simplified)
  img/                  photos, still image of the brain, share-preview image (og-image.jpg)
  logos/                institution marks
  cv/                   English and Chinese CVs (no phone number or date of birth)
tools/cv/               builds the two CV PDFs (Python); not needed by the site itself
licenses/               licences for three.js and the fonts
```

## How the code is written

The code follows the team's Principle of Aegis, adapted to a website (its numeric targets were
measured on scientific Python, so here we apply the practices, not the numbers):

- Comments give the reason, the edge case or the debt, not a restatement of the line.
- Every function other files call has a docstring (JSDoc or NumPy style) with units and assumptions.
- Nothing fails silently. A missing or damaged brain model, or a browser without WebGL, switches
  the page to its still version and says why in the browser console. The model's shape is checked
  (asserted) before anything is drawn.
- Each number that two places must agree on (the brain's screen position, how far map nodes sit
  inside the brain) is defined once, with its reason.
- Known debts are written as TODOs where they live: ship the mesh as binary, derive the lobe angles
  from the mesh, read the colours from the stylesheet.

## Notes

- **Search engines in China:** GitHub blocks Baidu's crawler, so the site won't appear in
  Baidu results. People in China will reach it through the link or QR code you share.
- **Older phones without 3D support** see a still image of the brain and a text version
  of the connections map, so nothing is lost.
- **Reduced motion:** visitors who turn on "reduce motion" get no automatic rotation or
  animation.

## Credits and licences

- 3D brain: **Allen Human Reference Atlas–3D (2020)**, via the HuBMAP CCF 3D Reference
  Object Library, **CC BY 4.0** (credited in the page footer).
- **three.js** — MIT licence (`licenses/three.js-LICENSE.txt`).
- **Source Sans 3** and **Source Serif 4** — SIL Open Font License 1.1 (`licenses/`).
- Institution logos belong to their owners and are shown only to indicate affiliation.
  Check each organisation's brand rules if you're unsure.
