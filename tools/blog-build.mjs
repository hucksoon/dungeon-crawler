// 개발 블로그 만들기: blog/posts/YYYY-MM-DD.md → blog/ 아래 정적 페이지 (GitHub Pages가 그대로 보여줌)
//   node tools/blog-build.mjs           # 만들기 (공개하면 안 되는 내용이 있으면 멈춤)
//   node tools/blog-build.mjs --check   # 만든 페이지가 글과 같은지만 확인 (테스트용, 파일을 쓰지 않음)
// 만드는 것
//   blog/index.html            글 목록 (최신 글이 위)
//   blog/YYYY-MM-DD.html       글
//   blog/feed.xml              RSS
//   blog/media.html            게임 이미지 (썸네일·스크린샷 보기·내려받기). 그림과 목록 blog/media/media.json은 node tools/media-sync.mjs로 가져옴
//   blog/naver/index.html      네이버 블로그에 옮길 글 목록 (검색 제외)
//   blog/naver/YYYY-MM-DD.html 제목·본문 복사 버튼 (네이버 에디터에 붙여 넣기, 한국어만)
// 글 형식: 맨 위 --- title / date / summary / tags --- 다음 Markdown (## ### 문단, - 목록(한 단계 들여쓰기), **굵게**, `코드`, [링크](https://…), > 인용)
//   이미지: 한 줄에 ![설명](images/파일.png) — blog/images/에 있어야 함 (게임 화면은 node tools/blog-shots.mjs로 찍음). 설명은 그림 아래 글
import fs from "node:fs";
import path from "node:path";

// BLOG_ROOT: 다른 폴더에서 만들기 (테스트용)
const ROOT = process.env.BLOG_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const POSTS = path.join(ROOT, "blog/posts"), OUT = path.join(ROOT, "blog"), IMAGES = path.join(ROOT, "blog/images"), MEDIA = path.join(ROOT, "blog/media");
const SITE = "https://game.apacimtest.com";
const BLOG_URL = `${SITE}/blog/`;
const BLOG_TITLE = "던전 크롤러 개발 블로그";
const BANNER = `${SITE}/img/banner.png`;   // 게임 배너 (게임 로고 img/logo.png는 이 배너의 가운데)
const BLOG_DESC = "Claude Code와 같이 라이브 코딩으로 만드는 브라우저 로그라이크 게임의 개발 이야기";
const CHECK = process.argv.includes("--check");

// ---- 공개하면 안 되는 내용 (서버 내부 정보·개인정보·비밀값·운영자 도구) ----
const PRIVATE = [
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/, "IP 주소"],
  [/\bip-\d+-\d+-\d+-\d+\b/i, "서버 호스트 이름"],
  [/(?:^|[\s`(])\/(?:var|etc|home|root|tmp|usr|opt)\//m, "서버 파일 경로"],
  [/\b(?:sudo|crontab|systemctl|apt(?:-get)?\s+(?:install|remove|upgrade))\b/, "서버 명령"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "이메일 주소"],
  [/\b(?:webhook_secret|hash_key|api_key|jwt_secret|xsolla_api_key|secret_key|password)\b/i, "비밀값 이름"],
  [/\b(?:admin|gift|config)\.php\b/, "운영자 도구·설정 파일"],
  [/\b[0-9a-f]{32,}\b/i, "긴 키·해시 값"],
  [/BEGIN [A-Z ]*PRIVATE KEY/, "개인 키"],
  [/\.env\b/, "비밀값 파일"],
];

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dateText = (d) => { const [y, m, day] = d.split("-").map(Number); return `${y}년 ${m}월 ${day}일 (${WEEKDAY[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]})`; };

function parsePost(file) {
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${path.basename(file)}: 맨 위에 --- 머리말 --- 이 없어요`);
  const meta = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  const name = path.basename(file, ".md");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(name) || meta.date !== name) throw new Error(`${name}: 파일 이름과 date가 같아야 해요 (YYYY-MM-DD)`);
  for (const k of ["title", "summary"]) if (!meta[k]) throw new Error(`${name}: ${k}가 없어요`);
  return { slug: name, date: meta.date, title: meta.title, summary: meta.summary, tags: (meta.tags || "").split(",").map(s => s.trim()).filter(Boolean), body: m[2].trim() };
}

// ---- Markdown (블로그 글에 쓰는 만큼만) ----
function inline(s, st) {
  const out = [];
  let rest = esc(s);
  // `코드`는 먼저 빼 두고 나머지만 바꿈
  rest = rest.replace(/`([^`]+)`/g, (_, c) => { out.push(`<code${st.code}>${c}</code>`); return `\u0000${out.length - 1}\u0000`; });
  rest = rest.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\.{0,2}\/?[^)\s:]+)\)/g, (_, t, u) => `<a href="${u}"${st.a}>${t}</a>`);
  rest = rest.replace(/\*\*([^*]+)\*\*/g, `<strong${st.b}>$1</strong>`);
  return rest.replace(/\u0000(\d+)\u0000/g, (_, i) => out[i]);
}
// st: 태그별 추가 속성 (네이버용은 인라인 style, 블로그는 없음)
// imgBase: 이미지 주소 앞 (블로그는 상대 주소, 네이버는 전체 주소)
function markdown(md, st, imgBase = "") {
  const lines = md.split("\n"), html = [];
  let para = [], list = null;   // list: [{ text, sub: [] }]
  const flushPara = () => { if (para.length) html.push(`<p${st.p}>${inline(para.join(" "), st)}</p>`); para = []; };
  const flushList = () => {
    if (!list) return;
    html.push(`<ul${st.ul}>` + list.map(li => `<li${st.li}>${inline(li.text, st)}${li.sub.length ? `<ul${st.ul}>` + li.sub.map(t => `<li${st.li}>${inline(t, st)}</li>`).join("") + "</ul>" : ""}</li>`).join("") + "</ul>");
    list = null;
  };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) { flushPara(); flushList(); const tag = m[1].length === 2 ? "h2" : "h3"; html.push(`<${tag}${st[tag]}>${inline(m[2], st)}</${tag}>`); continue; }
    if (/^#\s/.test(line)) throw new Error(`# 제목은 쓰지 않아요 (title이 제목): ${line}`);
    if ((m = /^!\[([^\]]*)\]\(images\/([\w.-]+\.(?:png|jpg|jpeg|webp|gif))\)$/.exec(line.trim()))) {
      flushPara(); flushList();
      if (!fs.existsSync(path.join(IMAGES, m[2]))) throw new Error(`이미지가 없어요: blog/images/${m[2]}`);
      html.push(`<figure${st.fig}><img src="${imgBase}images/${m[2]}" alt="${esc(m[1])}" loading="lazy"${st.img}>${m[1] ? `<figcaption${st.cap}>${inline(m[1], st)}</figcaption>` : ""}</figure>`);
      continue;
    }
    if (/^!\[/.test(line.trim())) throw new Error(`이미지는 한 줄에 ![설명](images/파일.png) 형식으로: ${line.slice(0, 60)}`);
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); html.push(`<blockquote${st.q}>${inline(m[1], st)}</blockquote>`); continue; }
    if ((m = /^ {2,4}[-*]\s+(.*)$/.exec(line)) && list) { list[list.length - 1].sub.push(m[1]); continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) { flushPara(); (list ||= []).push({ text: m[1], sub: [] }); continue; }
    if (list && /^ {2,}\S/.test(line)) { const last = list[list.length - 1]; if (last.sub.length) last.sub[last.sub.length - 1] += " " + line.trim(); else last.text += " " + line.trim(); continue; }
    if (/^(```|<|\|)/.test(line)) throw new Error(`코드 블록·HTML·표는 쓰지 않아요: ${line.slice(0, 40)}`);
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return html.join("\n");
}
const NO_STYLE = new Proxy({}, { get: () => "" });
// 네이버 에디터에 붙여 넣으면 클래스는 사라지고 인라인 style만 남아서, 글자 크기·굵기를 직접 적음
const NAVER_STYLE = {
  p: ' style="font-size:16px;line-height:1.8;margin:0 0 16px;"', h2: ' style="font-size:22px;font-weight:bold;margin:32px 0 12px;"', h3: ' style="font-size:18px;font-weight:bold;margin:24px 0 8px;"',
  ul: ' style="font-size:16px;line-height:1.8;margin:0 0 16px;padding-left:24px;"', li: "", b: "", code: ' style="background:#f2f2f2;padding:1px 4px;"',
  a: "", q: ' style="border-left:4px solid #ccc;margin:0 0 16px;padding:4px 12px;color:#555;font-size:16px;"',
  fig: ' style="margin:0 0 20px;text-align:center;"', img: ' style="max-width:100%;height:auto;"', cap: ' style="font-size:14px;color:#777;margin-top:6px;"',
};
const images = (md) => [...md.matchAll(/^!\[([^\]]*)\]\(images\/([\w.-]+)\)\s*$/gm)].map(m => ({ alt: m[1], file: m[2] }));

function checkPrivate(post) {
  const text = `${post.title}\n${post.summary}\n${post.tags.join(",")}\n${post.body}`;
  const problems = [];
  text.split("\n").forEach((line, i) => { for (const [re, what] of PRIVATE) if (re.test(line)) problems.push(`${post.slug}.md ${i + 1}째 줄 근처: ${what} — ${line.trim().slice(0, 80)}`); });
  return problems;
}

// ---- 페이지 ----
const CSS = `
  :root { --bg: #0d0e14; --panel: #16181f; --border: #2a2d3a; --text: #cdd3de; --muted: #8a91a0; --accent: #ffcf5c; --link: #6bd3ff; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font-family: "Courier New", ui-monospace, monospace; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 56px; line-height: 1.8; font-size: 15px; }
  a { color: var(--link); }
  h1 { font-size: 22px; color: var(--accent); margin: 8px 0 4px; line-height: 1.4; }
  h2 { font-size: 18px; color: var(--accent); margin: 32px 0 8px; padding-top: 12px; border-top: 1px solid var(--border); }
  h3 { font-size: 16px; margin: 20px 0 6px; }
  ul { padding-left: 22px; }
  code { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 0 4px; font-size: 0.92em; }
  blockquote { margin: 0 0 16px; padding: 6px 14px; border-left: 3px solid var(--accent); background: var(--panel); }
  .nav { display: flex; gap: 12px; flex-wrap: wrap; font-size: 13px; margin-bottom: 8px; }
  .meta { color: var(--muted); font-size: 13px; margin: 0 0 20px; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 0; padding: 0; list-style: none; }
  .tags li { font-size: 12px; border: 1px solid var(--border); border-radius: 10px; padding: 0 8px; color: var(--muted); }
  .post { display: block; text-decoration: none; color: inherit; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 14px 16px; margin: 0 0 12px; }
  .post:hover { border-color: var(--accent); }
  .post b { color: var(--accent); font-size: 16px; }
  .post p { margin: 6px 0 0; font-size: 14px; }
  figure { margin: 8px 0 24px; text-align: center; }
  figure img { max-width: 100%; height: auto; border: 1px solid var(--border); border-radius: 6px; }
  figcaption { color: var(--muted); font-size: 13px; margin-top: 6px; }
  .banner { display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border); margin: 4px 0 16px; }
  .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border); font-size: 14px; }
  footer { margin-top: 40px; color: var(--muted); font-size: 12px; }
  .media { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; margin: 8px 0 8px; }
  .shot { margin: 0; background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 8px; text-align: left; }
  .shot a.view { display: block; }
  .shot img { display: block; width: 100%; height: 190px; object-fit: contain; background: #000; border: 0; border-radius: 4px; }
  .shot figcaption { color: var(--text); font-size: 13px; margin: 0; line-height: 1.5; flex: 1; }
  .shot figcaption span { color: var(--muted); font-size: 12px; }
  .dl { display: inline-block; text-align: center; text-decoration: none; font-size: 13px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--accent); color: var(--accent); }
  .dl:hover { background: var(--accent); color: #111; }
  .dl.all { background: var(--accent); color: #111; font-size: 14px; padding: 8px 16px; }
  .ad-unit { margin: 28px 0; min-height: 50px; }
`;
// 애드센스 자동 광고 코드 (dc#120): 공개 글·목록·게임 이미지 페이지에만. 네이버 옮기기 페이지(noindex)는 뺌
//   자동 광고는 AdSense에서 사이트 전체 끔 (게임 화면 양옆에 붙어서, dc#128). 광고는 글 중간 광고 칸(AD_UNIT)과 게임의 보상형 광고만
const ADSENSE = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6503525638904411" crossorigin="anonymous"></script>';
// 블로그 글 디스플레이 광고 단위 "블로그 글" (dc#128): 자동 광고는 게임 화면에 붙어서 사이트 전체에서 끄고, 블로그 글에만 이 칸을 직접 넣음
const AD_UNIT = `<div class="ad-unit"><ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-6503525638904411" data-ad-slot="6983849276" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>`;
// 광고 칸은 본문 중간 (dc#129): 글 길이의 절반에 가장 가까운 소제목(h2·h3, 없으면 문단 끝) 바로 앞. 첫 줄 앞에는 안 넣음
function withMidAd(html) {
  const at = (re) => [...html.matchAll(re)].map(m => m.index + (m[0].startsWith("</") ? m[0].length : 0)).filter(i => i > 0 && i < html.length);
  const cuts = [/<h[23][ >]/g, /<\/p>\n/g].map(at).find(c => c.length);
  if (!cuts) return `${html}\n${AD_UNIT}`;
  const mid = cuts.reduce((a, b) => Math.abs(b - html.length / 2) < Math.abs(a - html.length / 2) ? b : a);
  return `${html.slice(0, mid)}${AD_UNIT}\n${html.slice(mid)}`;
}
const page = ({ title, desc, url, body, noindex = false, extraHead = "", image = null }) => `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ""}<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/img/favicon-32.png">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="${esc(BLOG_TITLE)}" href="${BLOG_URL}feed.xml">
<meta property="og:type" content="${url === BLOG_URL ? "website" : "article"}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
${image ? `<meta property="og:image" content="${image}">\n` : ""}${noindex ? "" : `${ADSENSE}\n`}
<style>${CSS}${extraHead}</style>
</head>
<body>
<main>
${body}
<footer>${esc(BLOG_TITLE)} · <a href="${SITE}/">게임 하기</a> · <a href="${BLOG_URL}media.html">게임 이미지</a> · <a href="${BLOG_URL}feed.xml">RSS</a></footer>
</main>
</body>
</html>
`;
const tagList = (tags) => tags.length ? `<ul class="tags">${tags.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "";

function postPage(p, prev, next) {
  return page({
    title: `${p.title} — ${BLOG_TITLE}`, desc: p.summary, url: `${BLOG_URL}${p.slug}.html`, image: images(p.body)[0] ? `${BLOG_URL}images/${images(p.body)[0].file}` : BANNER,
    body: `<nav class="nav"><a href="./">← 글 목록</a><a href="${SITE}/">게임 하기</a></nav>
<article>
<h1>${esc(p.title)}</h1>
<p class="meta">${dateText(p.date)}${p.tags.length ? " · " + p.tags.map(esc).join(" · ") : ""}</p>
${withMidAd(markdown(p.body, NO_STYLE))}
</article>
<nav class="pager"><span>${prev ? `<a href="${prev.slug}.html">← ${esc(prev.title)}</a>` : ""}</span><span>${next ? `<a href="${next.slug}.html">${esc(next.title)} →</a>` : ""}</span></nav>`,
  });
}

function indexPage(posts) {
  return page({
    title: BLOG_TITLE, desc: BLOG_DESC, url: BLOG_URL, image: BANNER,
    body: `<nav class="nav"><a href="${SITE}/">← 게임 하기</a><a href="media.html">게임 이미지 (썸네일·스크린샷)</a><a href="feed.xml">RSS</a></nav>
<a href="${SITE}/"><img class="banner" src="../img/banner.png" alt="던전 크롤러 (Dungeon Crawler)" width="773" height="253"></a>
<h1>${esc(BLOG_TITLE)}</h1>
<p class="meta">${esc(BLOG_DESC)}. 글은 날짜별 개발 일지를 바탕으로 써요.</p>
${posts.map(p => `<a class="post" href="${p.slug}.html"><b>${esc(p.title)}</b><p class="meta" style="margin:2px 0 0">${dateText(p.date)}</p><p>${esc(p.summary)}</p>${tagList(p.tags)}</a>`).join("\n")}`,
  });
}

// 게임 이미지: 썸네일·스크린샷을 미리보기로 보여 주고, 누르면 원래 크기, 내려받기 버튼과 전체 zip
const sizeText = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
function readMedia() {
  const file = path.join(MEDIA, "media.json");
  if (!fs.existsSync(file)) return null;
  const m = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const f of [m.zip, ...m.groups.flatMap(g => g.items.flatMap(it => [it.file, it.preview]))])
    if (!/^[\w./-]+$/.test(f) || f.includes("..") || !fs.existsSync(path.join(MEDIA, f))) throw new Error(`게임 이미지 파일이 없어요: blog/media/${f} (node tools/media-sync.mjs)`);
  return m;
}
function mediaPage(m) {
  const count = m.groups.reduce((s, g) => s + g.items.length, 0), cover = m.groups[0].items[0];
  const card = (it) => `<figure class="shot"><a class="view" href="media/${it.file}"><img src="media/${it.preview}" alt="${esc(it.caption)}" loading="lazy"></a>` +
    `<figcaption>${esc(it.caption)}<br><span>${it.w}×${it.h} · PNG · ${sizeText(it.bytes)}</span></figcaption><a class="dl" href="media/${it.file}" download="${it.file}">내려받기</a></figure>`;
  return page({
    title: `게임 이미지 — ${BLOG_TITLE}`, desc: "던전 크롤러 썸네일과 스크린샷 보기·내려받기", url: `${BLOG_URL}media.html`, image: `${BLOG_URL}media/${cover.file}`,
    body: `<nav class="nav"><a href="./">← 글 목록</a><a href="${SITE}/">게임 하기</a></nav>
<h1>게임 이미지</h1>
<p class="meta">던전 크롤러의 썸네일과 스크린샷이에요. 그림을 누르면 원래 크기로 보이고, 내려받기 버튼으로 저장해요.</p>
<p><a class="dl all" href="media/${m.zip}" download="${m.zip}">전체 내려받기 (zip · ${count}장 · ${sizeText(m.zipBytes)})</a></p>
${m.groups.map(g => `<h2>${esc(g.title)}</h2>\n<p class="meta">${esc(g.note)}</p>\n<div class="media">\n${g.items.map(card).join("\n")}\n</div>`).join("\n")}`,
  });
}

function feed(posts) {
  const rfc = (d) => new Date(`${d}T21:00:00+09:00`).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(BLOG_TITLE)}</title>
<link>${BLOG_URL}</link>
<description>${esc(BLOG_DESC)}</description>
<language>ko</language>
${posts.map(p => `<item>
<title>${esc(p.title)}</title>
<link>${BLOG_URL}${p.slug}.html</link>
<guid>${BLOG_URL}${p.slug}.html</guid>
<pubDate>${rfc(p.date)}</pubDate>
<description>${esc(p.summary)}</description>
</item>`).join("\n")}
</channel>
</rss>
`;
}

// 네이버 블로그용: 제목 복사 → 네이버 제목 칸, 본문 복사 → 네이버 본문에 붙여 넣기 (서식 유지). 끝에 원문 링크
const NAVER_CSS = `
  #paper { background: #fff; color: #222; border-radius: 8px; padding: 24px; font-family: sans-serif; }
  #paper h2, #paper h3 { color: #222; border: 0; padding: 0; }
  #paper a { color: #0068c3; }
  #paper code { border: 0; }
  #paper blockquote { background: none; }
  .bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 16px; }
  .bar button { font: inherit; font-size: 14px; padding: 8px 14px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: #111; cursor: pointer; }
  .bar button.alt { background: transparent; color: var(--accent); }
  #status { color: var(--muted); font-size: 13px; min-height: 1.4em; }
  .steps { font-size: 13px; color: var(--muted); }
`;
const NAVER_JS = `
<script>
  async function copy(html, text) {
    try {
      if (window.ClipboardItem && html) await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      else await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 클립보드 권한이 없으면 선택해서 복사
      const r = document.createRange(), sel = getSelection(), el = html ? document.getElementById("paper") : document.getElementById("title-text");
      r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
      const ok = document.execCommand("copy"); sel.removeAllRanges(); return ok;
    }
  }
  const status = (t) => { document.getElementById("status").textContent = t; };
  document.getElementById("copy-title").onclick = async () => status(await copy(null, document.getElementById("title-text").textContent) ? "제목을 복사했어요. 네이버 글쓰기의 제목 칸에 붙여 넣으세요." : "복사하지 못했어요. 제목을 직접 선택해 복사해 주세요.");
  document.getElementById("copy-body").onclick = async () => { const p = document.getElementById("paper"); status(await copy(p.innerHTML, p.innerText) ? "본문을 복사했어요. 네이버 글쓰기 본문에 붙여 넣으세요 (서식 유지)." : "복사하지 못했어요. 아래 본문을 직접 선택해 복사해 주세요."); };
</script>`;
// 네이버 스마트에디터는 붙여 넣은 HTML의 여백(margin)·목록(ul/li)·제목 태그를 버려서 줄이 붙어 버림.
// 그래서 네이버용은 모두 한 줄짜리 문단(<p>)으로 만들고, 빈 줄은 빈 문단(<p><br></p>)으로, 목록은 • 글머리로, 제목은 굵고 큰 글씨로
const N_BLANK = "<p><br></p>";
function naverBody(md) {
  const out = [];
  const P = (html, style = "") => out.push(`<p${style ? ` style="${style}"` : ""}>${html}</p>`);
  const blank = () => { if (out.length && out[out.length - 1] !== N_BLANK) out.push(N_BLANK); };
  let para = [], inList = false;
  const flushPara = () => { if (para.length) { P(inline(para.join(" "), NAVER_STYLE)); blank(); } para = []; };
  const endList = () => { if (inList) blank(); inList = false; };
  for (const raw of md.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if (!line.trim()) { flushPara(); endList(); continue; }
    if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) { flushPara(); endList(); blank(); P(`<b><span style="font-size:${m[1].length === 2 ? 24 : 19}px;">${inline(m[2], NAVER_STYLE)}</span></b>`); continue; }
    if ((m = /^!\[([^\]]*)\]\(images\/([\w.-]+)\)$/.exec(line.trim()))) {
      flushPara(); endList();
      P(`<img src="${BLOG_URL}images/${m[2]}" alt="${esc(m[1])}" style="max-width:100%;height:auto;">`, "text-align:center;");
      if (m[1]) P(`<span style="font-size:13px;color:#888888;">${inline(m[1], NAVER_STYLE)}</span>`, "text-align:center;");
      blank(); continue;
    }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); endList(); P(`<span style="color:#666666;">❝ ${inline(m[1], NAVER_STYLE)} ❞</span>`); blank(); continue; }
    if ((m = /^ {2,4}[-*]\s+(.*)$/.exec(line)) && inList) { P(`&nbsp;&nbsp;&nbsp;&nbsp;◦ ${inline(m[1], NAVER_STYLE)}`); continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) { flushPara(); inList = true; P(`• ${inline(m[1], NAVER_STYLE)}`); continue; }
    if (inList && /^ {2,}\S/.test(line)) { out[out.length - 1] = out[out.length - 1].replace(/<\/p>$/, ` ${inline(line.trim(), NAVER_STYLE)}</p>`); continue; }
    endList(); para.push(line.trim());
  }
  flushPara(); endList();
  return out.join("\n");
}
function naverPage(p) {
  const url = `${BLOG_URL}${p.slug}.html`;
  const imgs = images(p.body);
  const body = naverBody(p.body) + `\n${N_BLANK}\n<p>📝 원문과 지난 개발 이야기: <a href="${url}">${url}</a></p>\n<p>🎮 게임 하기: <a href="${SITE}/">${SITE}/</a></p>`;
  return page({
    title: `[네이버 옮기기] ${p.title}`, desc: p.summary, url: `${BLOG_URL}naver/${p.slug}.html`, noindex: true, extraHead: NAVER_CSS,
    body: `<nav class="nav"><a href="./">← 네이버 옮기기 목록</a><a href="../${p.slug}.html">블로그 글 보기</a></nav>
<h1 id="title-text">${esc(p.title)}</h1>
<p class="meta">${dateText(p.date)} · 태그: ${p.tags.map(esc).join(", ") || "없음"}</p>
<p class="steps">네이버 블로그 → 글쓰기에서 ① 제목 복사 → 제목 칸에 붙여 넣기 ② 본문 복사 → 본문에 붙여 넣기 ③ 태그 입력 → 발행</p>
<div class="bar"><button type="button" id="copy-title">① 제목 복사</button><button type="button" id="copy-body">② 본문 복사</button></div>
<p id="status" aria-live="polite"></p>
${imgs.length ? `<p class="steps">이미지 ${imgs.length}장은 본문과 함께 복사돼요. 네이버에 이미지가 안 들어가면 아래에서 저장해서 그 자리에 올려 주세요: ${imgs.map((im, i) => `<a href="../images/${im.file}" download="${p.slug}-${i + 1}-${im.file}">${i + 1}. ${esc(im.alt || im.file)}</a>`).join(" · ")}</p>` : ""}
<div id="paper">
${body}
</div>${NAVER_JS}`,
  });
}

function naverIndex(posts) {
  return page({
    title: `[네이버 옮기기] ${BLOG_TITLE}`, desc: "네이버 블로그에 옮길 글", url: `${BLOG_URL}naver/`, noindex: true,
    body: `<nav class="nav"><a href="../">← 블로그</a></nav>
<h1>네이버 블로그 옮기기</h1>
<p class="meta">네이버는 자동 게시를 막아 두어서, 글마다 제목·본문 복사 버튼으로 옮겨요. 이 페이지는 검색에 나오지 않아요.</p>
${posts.map(p => `<a class="post" href="${p.slug}.html"><b>${esc(p.title)}</b><p class="meta" style="margin:2px 0 0">${dateText(p.date)}</p></a>`).join("\n")}`,
  });
}

// ---- 만들기 ----
const files = fs.existsSync(POSTS) ? fs.readdirSync(POSTS).filter(f => f.endsWith(".md")).sort() : [];
const posts = files.map(f => parsePost(path.join(POSTS, f))).sort((a, b) => a.date.localeCompare(b.date));
const problems = posts.flatMap(checkPrivate);
if (problems.length) {
  console.error("공개하면 안 되는 내용이 있어요. 글을 고친 뒤 다시 만들어 주세요:\n" + problems.map(p => "  - " + p).join("\n"));
  process.exit(1);
}
const outputs = new Map();
posts.forEach((p, i) => {
  outputs.set(`${p.slug}.html`, postPage(p, posts[i - 1], posts[i + 1]));
  outputs.set(`naver/${p.slug}.html`, naverPage(p));
});
const newest = [...posts].reverse();
outputs.set("index.html", indexPage(newest));
outputs.set("feed.xml", feed(newest));
outputs.set("naver/index.html", naverIndex(newest));
const media = readMedia();
if (media) outputs.set("media.html", mediaPage(media));

// 지금 만든 것 말고 남아 있는 페이지 (지운 글)
const existing = [];
for (const dir of ["", "naver/"]) {
  const d = path.join(OUT, dir);
  if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/\.(html|xml)$/.test(f)) existing.push(dir + f);
}
const stale = existing.filter(f => !outputs.has(f));
if (CHECK) {
  const diff = [...outputs].filter(([f, html]) => !fs.existsSync(path.join(OUT, f)) || fs.readFileSync(path.join(OUT, f), "utf8") !== html).map(([f]) => f).concat(stale);
  if (diff.length) { console.error(`블로그 페이지가 글과 달라요 (node tools/blog-build.mjs 로 다시 만들기): ${diff.join(", ")}`); process.exit(1); }
  console.log(`블로그 ${posts.length}편 · 페이지가 글과 같아요`);
} else {
  fs.mkdirSync(path.join(OUT, "naver"), { recursive: true });
  for (const [f, html] of outputs) fs.writeFileSync(path.join(OUT, f), html);
  for (const f of stale) fs.rmSync(path.join(OUT, f));
  console.log(`블로그 ${posts.length}편 만들었어요 → blog/ (글 ${posts.length} · 네이버 옮기기 ${posts.length} · 목록 · RSS)${stale.length ? ` · 지운 페이지 ${stale.length}` : ""}`);
}
