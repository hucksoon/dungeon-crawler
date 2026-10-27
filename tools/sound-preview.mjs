// 소리 미리 듣기 파일 (dc#99): 브라우저에서 sound.js가 내는 효과음과 배경 음악을 녹음해 mp3로
//   NODE_PATH=$(npm root -g) node tools/sound-preview.mjs [나갈 폴더] [곡마다 초]
// 필요: playwright(전역), Chromium, ffmpeg
import { createRequire } from "node:module";
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const require = createRequire(process.env.NODE_PATH + "/");
const { chromium } = require("playwright");
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.resolve(process.argv[2] || "sound-preview"), SECS = +(process.argv[3] || 14);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.setContent(`<script>${fs.readFileSync(path.join(REPO, "sound.js"), "utf8")}</script>`);
// 녹음: fn을 실행하고 ms 동안 나오는 소리를 webm으로
const record = (name, script, ms) => page.evaluate(async ([script, ms]) => {
  const S = window.RLSound; S.unlock();
  const rec = new MediaRecorder(S.tap(), { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 128000 }), parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise(r => { rec.onstop = r; });
  rec.start(); new Function("S", script)(S);
  await new Promise(r => setTimeout(r, ms)); rec.stop(); await done;
  const b = new Uint8Array(await new Blob(parts).arrayBuffer());
  let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}, [script, ms]).then(b64 => { const f = path.join(OUT, `${name}.webm`); fs.writeFileSync(f, Buffer.from(b64, "base64")); return f; });

const files = [];
// 효과음 모음: 이름 순서대로 0.9초 간격
const SFX = [["swing"], ["hit"], ["crit"], ["fire"], ["ice"], ["bolt"], ["fireball", 0.17], ["nova"], ["chain", 3, 0.07], ["whirl"], ["blast"], ["block"], ["dodge"], ["hurt"], ["kill"], ["bossKill"], ["gold"], ["drop", "rare"], ["drop", "epic"], ["drop", "legendary"], ["drop", "set"], ["drop", "unique"], ["potion"], ["levelup"], ["stairs"], ["portal"], ["waypoint"], ["tomb"], ["buy"], ["enhance"], ["death"]];
files.push(await record("00-sfx", `S.music(null); ${JSON.stringify(SFX)}.forEach((a, i) => setTimeout(() => S.play(...a), 300 + i * 900));`, 300 + SFX.length * 900 + 1500));
for (const [i, t] of ["town", "dungeon", "nightmare", "hell", "gold", "boss"].entries()) {
  files.push(await record(`${i + 1}-${t}`, `S.music(${JSON.stringify(t)});`, SECS * 1000));
}
await browser.close();
for (const f of files) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", f, "-codec:a", "libmp3lame", "-q:a", "4", f.replace(/\.webm$/, ".mp3")]), fs.rmSync(f);
console.log(fs.readdirSync(OUT).map(f => path.join(OUT, f)).join("\n"));
