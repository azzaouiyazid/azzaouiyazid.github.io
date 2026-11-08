"""Build the public CVs (English and Chinese) as two-page A4 PDFs for the website.

The CV is written here as HTML, styled by ``cv.css`` and printed by headless Chromium, so the
PDFs match the site's colours and both languages come from one source. Run it from anywhere::

    python3 tools/cv/build_cv.py              # writes assets/cv/Yazid_Azzaoui_CV_EN.pdf and _ZH.pdf
    python3 tools/cv/build_cv.py --lang en    # one language only

These are the public versions, so they follow three rules we agreed on: no phone number, no date
of birth, and no unpublished numerical results (cohort sizes describe the design and are kept;
AUCs, p-values and findings are not). Edit the text in the ``_section`` functions below; each
string appears as ``T(english, chinese)``.

Requires the Python ``playwright`` package with Chromium installed, and ``pypdf`` for the page check.
"""
import argparse
import os
import warnings
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent.parent / "assets" / "cv"
# the CV is designed for two pages; a third page usually means a section grew and the layout broke
PAGES_EXPECTED = 2
UPDATED = {"en": "Updated November 2026", "zh": "更新于 2026 年 11 月"}

AEGIS_STATUS = {"en": "Under review at <i>Nature Communications</i>.", "zh": "<i>Nature Communications</i>，在审。"}
PROTEIN_STATUS = {"en": "Under review at <i>Brain, Behavior, and Immunity</i>.", "zh": "<i>Brain, Behavior, and Immunity</i>，在审。"}


def _translator(lang):
    """Return T(en, zh), which picks the string for ``lang`` ('en' or 'zh')."""
    assert lang in ("en", "zh"), f"lang must be 'en' or 'zh', got {lang!r}"
    return (lambda en, zh: zh) if lang == "zh" else (lambda en, zh: en)


def _heading(T, lang, en, zh):
    # the Chinese CV keeps the English heading in small type, because many readers scan for it
    small = f"<small>{en}</small>" if lang == "zh" else ""
    return f"<h2>{T(en, zh)}{small}</h2>"


def _section(T, lang, en, zh, body, keep=True):
    # short sections must not split across pages (keep); the two long ones may, between items
    cls = ' class="keep"' if keep else ""
    return f"<section{cls}>{_heading(T, lang, en, zh)}{body}</section>"


def _item(title, when, meta, bullets):
    lis = "".join(f"<li>{b}</li>" for b in bullets)
    return (f'<div class="item"><div class="row"><b>{title}</b><span class="when">{when}</span></div>'
            f'<div class="meta">{meta}</div><ul>{lis}</ul></div>')


def _header(T):
    contact = [
        (T("Email", "邮箱"), '<a href="mailto:yazidazzaoui@mail.nwpu.edu.cn">yazidazzaoui@mail.nwpu.edu.cn</a>'),
        (T("Website", "个人主页"), '<a href="https://azzaouiyazid.github.io">azzaouiyazid.github.io</a>'),
        ("GitHub", '<a href="https://github.com/azzaouiyazid">github.com/azzaouiyazid</a>'),
        ("ORCID", '<a href="https://orcid.org/0009-0004-1744-2056">0009-0004-1744-2056</a>'),
        (T("Nationality", "国籍"), f'<span>{T("Moroccan", "摩洛哥")}</span>'),
    ]
    rows = "".join(f"<b>{k}</b>{v}" for k, v in contact)
    return (f'<div class="top"><div><h1>{T("YAZID AZZAOUI", "Yazid Azzaoui")}</h1>'
            f'<div class="sub">{T("M.Sc. Candidate in Computer Science · Northwestern Polytechnical University", "西北工业大学 · 计算机科学与技术专业 · 硕士研究生")}</div>'
            f'<div class="contact">{rows}</div></div><img class="photo" src="photo.jpg" alt=""></div>')


def _interests(T, lang):
    body = "<div>" + T("Large language models · Generative AI and privacy · Multimodal learning for multi-omics · Biomedical data science",
                       "大语言模型 · 生成式人工智能与隐私计算 · 多组学多模态学习 · 生物医学数据科学") + "</div>"
    return _section(T, lang, "Research interests", "研究方向", body)


def _education(T, lang):
    def line(label, text):
        return f'<div class="line"><b>{label}</b> {text}</div>'
    msc = (f'<div class="item"><div class="row"><b>{T("M.Sc. in Computer Science", "西北工业大学 · 计算机科学与技术 · 硕士")}</b><span class="when">2024.09 – 2027.06</span></div>'
           f'<div class="meta">{T("Northwestern Polytechnical University, Xi&#39;an, China · Supervisor: Prof. Zhaowen Liu", "计算机学院，中国西安 · 导师：刘曌雯 教授")}</div>'
           + line(T("Weighted average mark:", "加权平均成绩："), "87.29 / 100")
           + line(T("Thesis:", "学位论文："), T("“System-Level Framework for Interpretable Multi-Omic Network Modeling through LLM-Enhanced Knowledge Graphs”",
                                               "《基于大语言模型增强知识图谱的可解释多组学网络系统级建模框架》"))
           + line(T("Core courses:", "核心课程："), T("Algorithm Design and Analysis (95), Trustworthy Artificial Intelligence (93), High Performance Computing (92), Introduction to Bioinformatics (90)",
                                                    "算法设计与分析（95）、可信人工智能（93）、高性能计算（92）、生物信息学导论（90）"))
           + "</div>")
    # we leave the B.Eng. GPA out of the public CV; application forms that ask for it get it separately
    bsc = (f'<div class="item"><div class="row"><b>{T("B.Eng. in Software Engineering", "浙江工业大学 · 软件工程 · 工学学士")}</b><span class="when">2020.10 – 2024.06</span></div>'
           f'<div class="meta">{T("Zhejiang University of Technology, Hangzhou, China", "中国杭州")}</div>'
           + line(T("Graduation thesis:", "毕业设计："), T("“Visual Analysis of Student Behavior in Learning Videos”, Outstanding Graduation Thesis Award",
                                                       "《学习视频中学生行为的可视化分析》，校级优秀毕业设计（论文）"))
           + "</div>")
    return _section(T, lang, "Education", "教育经历", msc + bsc, keep=False)


def _research(T, lang):
    supervisor = T("Northwestern Polytechnical University · Supervisor: Prof. Zhaowen Liu", "西北工业大学 · 导师：刘曌雯 教授")
    aegis_link = '<a href="https://github.com/azzaouiyazid/AEGIS">github.com/azzaouiyazid/AEGIS</a>'
    thesis = _item(
        T("Master’s thesis: LLM-enhanced knowledge graphs for multi-omics", "硕士学位论文课题：基于大语言模型增强知识图谱的多组学研究"), T("Ongoing", "进行中"), supervisor,
        [T("Developing a system-level framework that uses multimodal large language models to build and enrich biological knowledge graphs, for interpretable network modelling of multi-omic data.",
           "构建系统级框架，利用多模态大语言模型构建并扩充生物知识图谱，实现多组学数据的可解释网络建模。"),
         T("Predicting each of the nine PHQ-9 depression symptoms separately from proteomic, metabolomic, genetic and brain MRI data in UK Biobank, with every gain tested against permuted outcomes.",
           "基于 UK Biobank 蛋白质组、代谢组、遗传与脑 MRI 数据分别预测 PHQ-9 九项抑郁症状，并以置换检验验证每一项提升。")])
    # methods and cohort size only: the audit's results stay out until the paper is published
    aegis = _item(
        T("AEGIS: privacy-preserving generative model of disease trajectories", "AEGIS：基于差分隐私的疾病轨迹生成模型"), T("2026 – Present", "2026 – 至今"),
        T("Northwestern Polytechnical University · Supervisor: Prof. Zhaowen Liu · Role: first author", "西北工业大学 · 导师：刘曌雯 教授 · 角色：第一作者"),
        [T("Built and trained AEGIS, a GPT-style transformer of lifetime disease trajectories, on 251,204 UK Biobank participants with person-level differential privacy (DP-SGD, ε = 8, 3, 1).",
           "构建并训练 AEGIS——一种预测终生疾病轨迹的 GPT 式 Transformer 模型，基于 UK Biobank 251,204 名参与者，采用个体级差分隐私训练（DP-SGD，ε = 8、3、1）。"),
         T("Designed a privacy audit with planted “canary” patients and membership-inference attacks, and evaluated how standard similarity checks for synthetic data behave.",
           "设计隐私审计方案（植入“金丝雀”患者并实施成员推断攻击），并评估合成数据常用相似性检验的有效性。"),
         T(f"Released the code as open source (MIT licence, runs on simulated data): {aegis_link}", f"代码已开源（MIT 许可，基于模拟数据运行）：{aegis_link}")])
    proteins = _item(
        T("Individualized proteomic network subtyping of major depressive disorder", "重度抑郁障碍的个体化蛋白质组网络分型研究"), "2025 – 2026",
        T("NWPU · Shanghai Jiao Tong University · Fudan University · Role: co-first author", "西北工业大学 · 上海交通大学 · 复旦大学 · 角色：共同第一作者"),
        [T("Built an individualized network framework: a reference partial-correlation network of 2,911 plasma proteins from 37,054 controls, with per-patient deviations for 6,765 patients with MDD.",
           "构建个体化网络分析框架：基于 37,054 名对照者的 2,911 种血浆蛋白建立参考偏相关网络，并计算 6,765 名抑郁症患者的个体化偏离。"),
         T("Characterised the resulting depression subtypes and linked them to clinical outcomes with survival analysis (Kaplan–Meier, Cox models) and to brain MRI measures.",
           "刻画所得抑郁亚型，并通过生存分析（Kaplan–Meier 曲线、Cox 模型）将其与临床结局及脑 MRI 指标相关联。")])
    return _section(T, lang, "Research experience", "科研经历", thesis + aegis + proteins, keep=False)


def _publications(T, lang):
    code = T("Code:", "代码：") + ' <a href="https://github.com/azzaouiyazid/AEGIS">github.com/azzaouiyazid/AEGIS</a>'
    refs = (f'<div class="note">{T("# co-first author · * corresponding author", "# 共同第一作者 · * 通讯作者")}</div><div class="refs">'
            '<p><span class="n">[1]</span> <b>Yazid Azzaoui</b>, Xinran Wu, Xuequn Shang, Jie Zhang, Zhaowen Liu*. '
            f'“AEGIS: private generative transformers that learn the natural history of disease, not the patients.” {AEGIS_STATUS[lang]} {code}</p>'
            '<p><span class="n">[2]</span> <b>Yazid Azzaoui</b>#, Xinran Wu#, Zhengxu Lian, Xuequn Shang, Jie Zhang*, Zhaowen Liu*. '
            '“A complement-depleted axis in major depressive disorder, distinct from C-reactive protein: individualized plasma proteomic network analysis.” '
            f'{PROTEIN_STATUS[lang]}</p></div>')
    return _section(T, lang, "Publications", "学术论文", refs)


def _conferences(T, lang):
    refs = ('<div class="refs"><p><span class="n">[1]</span> <b>Yazid Azzaoui</b>, Xinran Wu, Zhengxu Lian, Xuequn Shang, Jie Zhang, Zhaowen Liu. '
            '“Depression Is Not One Disease: Proteomic Links Between Cardiometabolic and Brainstem Pathways.” '
            + T("Poster presentation, <i>OHBM 2026 Annual Meeting</i>, Bordeaux, France, June 2026.",
                "墙报展示，<i>OHBM 2026 Annual Meeting</i>（国际人脑图谱组织年会），法国波尔多，2026 年 6 月。") + "</p>"
            '<p><span class="n">[2]</span> '
            + T("Participant, <i>2023 Apsara Conference</i> (Alibaba Cloud), “Computing for the value beyond computation”, Hangzhou, China, 2023.",
                "参会者，<i>2023 云栖大会</i>（阿里云），主题“计算，为了无法计算的价值”，中国杭州，2023 年。") + "</p></div>")
    return _section(T, lang, "Conferences", "学术会议", refs)


def _other_experience(T, lang):
    body = (
        _item(T("Research apprentice in machine learning", "浙江工业大学 · 机器学习研究助理"), "2022.09 – 2023.01",
              T("Zhejiang University of Technology, Hangzhou, China", "中国杭州"),
              [T("Led a project classifying molecular bioactivity in PubChem with molecular fingerprints (MHFP) and neural networks.",
                 "负责基于 PubChem 数据的分子生物活性分类项目，使用分子指纹（MHFP）与神经网络。")])
        + _item(T("Software engineering intern", "F2MED · 软件工程实习生"), "2022.07 – 2022.10", T("F2MED, Casablanca, Morocco", "摩洛哥卡萨布兰卡"),
                [T("Built a web application for stock management with real-time tracking and analytics, and optimised the database behind it.",
                   "开发库存管理 Web 应用（实时追踪与数据分析），并优化其数据库性能。")])
        # framed as engineering, not business: professors read "founder, ongoing" as divided attention
        + _item(T("Founder and engineer (side project)", "CASABLANCAN LLC · 创始人兼工程师（个人项目）"), T("Ongoing", "至今"), T("CASABLANCAN LLC, USA", "美国"),
                [T("Designed and built an online store from scratch: storefront, checkout and order tracking.", "从零设计并搭建线上商店：网站、支付与订单追踪。")]))
    return _section(T, lang, "Other experience", "实践经历", body)


def _honors(T, lang):
    rows = [
        (T("Chinese Government Scholarship (CSC), Master’s program", "中国政府奖学金（CSC），硕士研究生"), "2024 – 2027"),
        (T("Student Member, Organization for Human Brain Mapping (OHBM)", "国际人脑图谱组织（OHBM）学生会员"), T("2025 – present", "2025 – 至今")),
        (T("Outstanding Graduation Thesis Award, Zhejiang University of Technology", "浙江工业大学校级优秀毕业设计（论文）"), "2024"),
        (T("Zhejiang Provincial Scholarship", "浙江省政府奖学金"), "2023 – 2024"),
    ]
    body = "".join(f'<div class="row" style="margin:1.5pt 0"><span>• {a}</span><span class="when">{w}</span></div>' for a, w in rows)
    # memberships share this section because a one-line section of its own pushed the CV to three pages
    return _section(T, lang, "Honors and memberships", "荣誉奖励与学术组织", body)


def _skills(T, lang):
    rows = [
        (T("AI and deep learning", "人工智能与深度学习"), T("Transformers (GPT-style generative models), large language models (fine-tuning, prompting), PyTorch, TensorFlow, Hugging Face Transformers",
                                                    "Transformer（GPT 式生成模型）、大语言模型（微调、提示工程）、PyTorch、TensorFlow、Hugging Face Transformers")),
        (T("Privacy and security", "隐私与安全"), T("Differential privacy (DP-SGD), membership-inference attacks, privacy auditing, synthetic data evaluation",
                                               "差分隐私（DP-SGD）、成员推断攻击、隐私审计、合成数据评估")),
        (T("Statistics", "统计分析"), T("Gaussian graphical models, survival analysis (Kaplan–Meier, Cox), permutation testing, clustering, enrichment analysis",
                                      "高斯图模型、生存分析（Kaplan–Meier、Cox）、置换检验、聚类分析、富集分析")),
        (T("Biomedical data", "生物医学数据"), T("UK Biobank (Olink plasma proteomics, ICD-10 health records, brain MRI phenotypes), multi-omics integration",
                                            "UK Biobank（Olink 血浆蛋白质组、ICD-10 健康记录、脑 MRI 表型）、多组学数据整合")),
        (T("Programming", "编程语言"), "Python (NumPy, pandas, scikit-learn), R, SQL, Bash"),
        (T("Tools", "工具"), T("Git, LaTeX, Linux GPU servers, full-stack web development", "Git、LaTeX、Linux GPU 服务器、全栈 Web 开发")),
    ]
    body = '<div class="skills">' + "".join(f"<b>{a}</b><span>{b}</span>" for a, b in rows) + "</div>"
    return _section(T, lang, "Skills", "专业技能", body)


def _languages(T, lang):
    rows = [(T("Arabic:", "阿拉伯语："), T("fluent", "流利")), (T("French:", "法语："), T("fluent", "流利")),
            (T("English:", "英语："), T("fluent", "流利")), (T("German:", "德语："), T("fluent", "流利")),
            (T("Chinese:", "汉语："), T("basic", "基础"))]
    body = '<div class="langs">' + "".join(f"<span><b>{a}</b> {b}</span>" for a, b in rows) + "</div>"
    return _section(T, lang, "Languages", "语言能力", body)


def build_html(lang):
    """Assemble the CV as one HTML document for ``lang``.

    The sections come in the order a reader scans a research CV: interests, education, research,
    publications, then everything that supports them. Paths to the stylesheet, fonts and photo are
    relative to this folder, so the HTML must be written next to ``cv.css``.

    Parameters
    ----------
    lang : {'en', 'zh'}
        Language of every visible string except names, titles of papers and journal names,
        which stay in their original English.

    Returns
    -------
    str
        A complete HTML document.
    """
    T = _translator(lang)
    title = T("Yazid Azzaoui - Curriculum Vitae", "Yazid Azzaoui 个人简历")
    parts = [_header(T), _interests(T, lang), _education(T, lang), _research(T, lang), _publications(T, lang),
             _conferences(T, lang), _other_experience(T, lang), _honors(T, lang), _skills(T, lang), _languages(T, lang)]
    html_lang = "zh-CN" if lang == "zh" else "en"
    return (f'<!doctype html><html lang="{html_lang}"><head><meta charset="utf-8"><title>{title}</title>'
            f'<link rel="stylesheet" href="cv.css"></head><body>{"".join(parts)}</body></html>')


def _footer_template(lang):
    # Chromium fills pageNumber and totalPages; the footer must carry its own font and size,
    # because it is rendered outside the page's stylesheet
    T = _translator(lang)
    text = T(f"Yazid Azzaoui · Curriculum Vitae · azzaouiyazid.github.io · {UPDATED['en']} · Page <span class=\"pageNumber\"></span> of <span class=\"totalPages\"></span>",
             f"Yazid Azzaoui · 个人简历 · azzaouiyazid.github.io · {UPDATED['zh']} · 第 <span class=\"pageNumber\"></span> 页 / 共 <span class=\"totalPages\"></span> 页")
    return f"<div style=\"width:100%;text-align:center;font-size:7pt;color:#9C7C64;font-family:'Noto Sans CJK SC',sans-serif\">{text}</div>"


def build_pdf(lang, out_dir=DEFAULT_OUT):
    """Write ``Yazid_Azzaoui_CV_<LANG>.pdf`` for one language and check that it is two pages.

    We print with Chromium rather than a PDF library because the Chinese text needs real font
    fallback and line breaking, which Chromium does and simple PDF writers do not. A CV that grows
    past two pages still gets written, with a warning, so an edit never silently loses the file.

    Parameters
    ----------
    lang : {'en', 'zh'}
    out_dir : path-like
        Folder for the PDF; created if missing.

    Returns
    -------
    pathlib.Path
        Path of the written PDF.

    Raises
    ------
    FileNotFoundError
        If ``cv.css``, the fonts or the photo are missing next to this script.
    """
    from playwright.sync_api import sync_playwright  # imported here so --help works without Chromium
    from pypdf import PdfReader

    for needed in ("cv.css", "photo.jpg", "fonts/IBMPlexSans-400.ttf"):
        if not (HERE / needed).exists():
            raise FileNotFoundError(f"{needed} is missing next to build_cv.py ({HERE})")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = HERE / f"cv_{lang}.html"
    pdf_path = out_dir / f"Yazid_Azzaoui_CV_{lang.upper()}.pdf"
    html_path.write_text(build_html(lang), encoding="utf-8")
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(html_path.as_uri())
            page.wait_for_load_state("networkidle")  # the fonts and photo must be in before printing
            page.pdf(path=str(pdf_path), format="A4", print_background=True, display_header_footer=True,
                     header_template="<span></span>", footer_template=_footer_template(lang),
                     margin={"top": "14mm", "bottom": "16mm", "left": "15mm", "right": "15mm"})
            browser.close()
    finally:
        html_path.unlink(missing_ok=True)  # the HTML is a by-product; the source of truth is this file
    pages = len(PdfReader(str(pdf_path)).pages)
    if pages != PAGES_EXPECTED:
        warnings.warn(f"{pdf_path.name} has {pages} pages, expected {PAGES_EXPECTED}; shorten a section or tighten cv.css",
                      RuntimeWarning, stacklevel=2)
    return pdf_path


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the public CV PDFs for azzaouiyazid.github.io.")
    parser.add_argument("--lang", choices=("en", "zh", "both"), default="both")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="output folder (default: the site's assets/cv)")
    args = parser.parse_args(argv)
    for lang in (("en", "zh") if args.lang == "both" else (args.lang,)):
        print(build_pdf(lang, args.out))


if __name__ == "__main__":
    main()
