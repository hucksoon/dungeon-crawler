// 개발 블로그: 페이지가 글과 같은지, 공개하면 안 되는 내용을 막는지, 목록·글·RSS·네이버 옮기기(제목·본문 복사)
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = process.argv[2], SHOTS = process.argv[3];
const BUILD = path.join(REPO, "tools/blog-build.mjs");
const results = []; const check = (n, ok, x = "") => { results.push(!!ok); console.log(`${ok ? "PASS" : "FAIL"} ${n}${x && !ok ? " — " + x : ""}`); };
const posts = fs.readdirSync(path.join(REPO, "blog/posts")).filter(f => f.endsWith(".md")).map(f => f.slice(0, -3)).sort();

// ---- 만든 페이지가 글과 같은지 (글을 고치고 다시 만들지 않으면 실패) ----
const chk = spawnSync("node", [BUILD, "--check"], { encoding: "utf8" });
check("blog pages are up to date with the posts (tools/blog-build.mjs --check)", chk.status === 0, chk.stderr || chk.stdout);

// ---- 공개하면 안 되는 내용은 만들지 않음 ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blog-"));
fs.mkdirSync(path.join(tmp, "blog/posts"), { recursive: true });
const bad = (body) => { fs.writeFileSync(path.join(tmp, "blog/posts/2026-01-01.md"), `---\ntitle: 시험\ndate: 2026-01-01\nsummary: 시험 글\ntags: 시험\n---\n${body}\n`); return spawnSync("node", [BUILD], { encoding: "utf8", env: { ...process.env, BLOG_ROOT: tmp } }); };
for (const [what, body] of [["IP address", "서버 10.0.0.12에 올렸어요"], ["server path", "파일은 /var/www/html/ranking 에"], ["email", "문의는 someone@example.com"], ["shell command", "sudo systemctl restart apache2"], ["secret name", "webhook_secret 값을 넣었어요"], ["operator tool", "admin.php webhooks로 확인"], ["long key", "키 0123456789abcdef0123456789abcdef"]]) {
  const r = bad(body);
  check(`privacy guard blocks ${what}`, r.status === 1 && r.stderr.includes("공개하면 안 되는 내용") && !fs.existsSync(path.join(tmp, "blog/2026-01-01.html")), r.stderr);
}
fs.mkdirSync(path.join(tmp, "blog/images"), { recursive: true }); fs.copyFileSync(path.join(REPO, "blog/images/dungeon.png"), path.join(tmp, "blog/images/a.png"));
check("missing image file stops the build", bad("![없는 그림](images/none.png)").stderr.includes("이미지가 없어요"));
const good = bad("## 오늘\n\n- **굵게** 와 `코드`, [게임](https://game.apacimtest.com/)\n  - 들여쓴 줄\n\n> 인용\n\n![던전 화면](images/a.png)");
const html = fs.existsSync(path.join(tmp, "blog/2026-01-01.html")) ? fs.readFileSync(path.join(tmp, "blog/2026-01-01.html"), "utf8") : "";
check("clean post builds: headings, nested list, bold, code, link, quote", good.status === 0 && html.includes("<h2>오늘</h2>") && html.includes("<strong>굵게</strong>") && html.includes("<code>코드</code>") && html.includes('<a href="https://game.apacimtest.com/">게임</a>') && /<li>.*<ul><li>들여쓴 줄<\/li><\/ul><\/li>/.test(html) && html.includes("<blockquote>인용</blockquote>") && html.includes('<figure><img src="images/a.png" alt="던전 화면" loading="lazy"><figcaption>던전 화면</figcaption></figure>'), good.stderr);
check("HTML in a post is escaped, not injected", bad("<script>alert(1)</script> 글").status === 1 || !fs.readFileSync(path.join(tmp, "blog/2026-01-01.html"), "utf8").includes("<script>alert"));
fs.rmSync(tmp, { recursive: true, force: true });

// ---- 화면 ----
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "https://game.apacimtest.com" });
await ctx.route("https://game.apacimtest.com/**", r => { const f = new URL(r.request().url()).pathname.slice(1); const p = path.join(REPO, f === "" || f.endsWith("/") ? f + "index.html" : f);
  r.fulfill(fs.existsSync(p) ? { body: fs.readFileSync(p), contentType: p.endsWith(".xml") ? "application/xml" : "text/html; charset=utf-8" } : { status: 404, body: "" }); });
const page = await ctx.newPage(); const errors = [];
page.on("pageerror", e => errors.push(e.message));
try {
  await page.goto("https://game.apacimtest.com/blog/");
  const cards = await page.locator("a.post").count();
  check(`index lists every post (${posts.length}), newest first`, cards === posts.length && (await page.locator("a.post").first().getAttribute("href")) === `${posts.at(-1)}.html`);
  await page.screenshot({ path: path.join(SHOTS, "blog-index.png") });
  await page.locator("a.post").last().click();
  await page.waitForURL(/2026-\d\d-\d\d\.html$/);
  check("oldest post opens with title, date and next link", (await page.locator("h1").innerText()).length > 0 && (await page.locator(".meta").first().innerText()).includes("2026년") && (await page.locator(".pager a").count()) === 1);
  for (const slug of posts) {
    await page.goto(`https://game.apacimtest.com/blog/${slug}.html`);
    const t = await page.locator("article").innerText();
    if (!(t.length > 300 && (await page.locator("article h2").count()) >= 2)) { check(`post ${slug} has content`, false, t.slice(0, 120)); break; }
  }
  check("every post has a body and sections", results.at(-1) !== false);
  let broken = [];
  for (const slug of posts) {
    await page.goto(`https://game.apacimtest.com/blog/${slug}.html`);
    const imgs = await page.evaluate(async () => { const list = [...document.querySelectorAll("article figure img")]; list.forEach(i => { i.loading = "eager"; }); await Promise.all(list.map(i => i.decode().catch(() => {}))); return list.map(i => ({ src: i.getAttribute("src"), ok: i.naturalWidth > 0, cap: i.closest("figure").querySelector("figcaption")?.textContent || "" })); });
    if (!imgs.length) broken.push(`${slug}: 이미지 없음`);
    for (const im of imgs) if (!im.ok || !im.cap) broken.push(`${slug}: ${im.src}`);
  }
  check("every post has at least one image, all load and have captions", broken.length === 0, broken.join(", "));
  check("post pages share their first image (og:image)", fs.readFileSync(path.join(REPO, `blog/${posts.at(-1)}.html`), "utf8").includes('property="og:image" content="https://game.apacimtest.com/blog/images/'));
  const rss = fs.readFileSync(path.join(REPO, "blog/feed.xml"), "utf8");
  check("RSS lists every post with links", posts.every(s => rss.includes(`https://game.apacimtest.com/blog/${s}.html`)) && rss.startsWith("<?xml"));
  check("Naver pages are hidden from search (noindex)", fs.readFileSync(path.join(REPO, "blog/naver/index.html"), "utf8").includes('content="noindex"') && posts.every(s => fs.readFileSync(path.join(REPO, `blog/naver/${s}.html`), "utf8").includes('content="noindex"')));

  // 네이버 옮기기: 제목 복사, 본문 복사(서식 + 원문 링크)
  const slug = posts.at(-1);
  await page.goto(`https://game.apacimtest.com/blog/naver/${slug}.html`);
  await page.locator("#copy-title").click();
  await page.waitForFunction(() => document.getElementById("status").textContent.length > 0);
  const title = await page.evaluate(() => navigator.clipboard.readText());
  check("① copies the title", title === (await page.locator("#title-text").innerText()) && (await page.locator("#status").innerText()).includes("제목을 복사했어요"), title);
  await page.locator("#copy-body").click();
  await page.waitForFunction(() => document.getElementById("status").textContent.includes("본문"));   // 복사가 끝난 뒤 읽기
  const clip = await page.evaluate(async () => { const [it] = await navigator.clipboard.read(); return { types: it.types, html: it.types.includes("text/html") ? await (await it.getType("text/html")).text() : "" }; });
  check("② copies the body as rich HTML with inline styles and the original link", clip.types.includes("text/html") && /<h2 style="font-size:22px/.test(clip.html) && clip.html.includes(`https://game.apacimtest.com/blog/${slug}.html`) && (await page.locator("#status").innerText()).includes("본문을 복사했어요"), JSON.stringify(clip).slice(0, 200));
  check("copied body has images with full addresses (Naver can fetch them)", /<img src="https:\/\/game\.apacimtest\.com\/blog\/images\/[\w.-]+\.png"/.test(clip.html));
  const dl = page.locator('a[download]');
  check("each image also has a save link (if Naver drops pasted images)", (await dl.count()) === (await page.locator("#paper img").count()) && (await dl.count()) > 0);
  await page.screenshot({ path: path.join(SHOTS, "blog-naver.png") });
  check("no page errors", errors.length === 0, errors.join("; "));
} finally { await browser.close(); }
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
