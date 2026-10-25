// 마을(옆에서 보는 로비, dc#90) 테스트 도우미: 문 id(jump.js RLJump.TOWN.doors)까지 진짜 키로 걸어가서 ↑로 들어감
//   문: jumptower · towerHell(운영자) · forge · market · mailbox · hourshop · start(1층) · resume(파란 포탈) · skip(최고−10층) · staff(운영자)
//       golddungeon · golddungeonNM · nightmare · nightmare50 · hell · hellPick
// 멀면 오래 누르고, 가까우면 짧게 톡톡 (마찰로 미끄러지는 만큼 덜 누름). 위치는 window.RLTownPos() (읽기만)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export async function goDoor(page, id, { enter = true } = {}) {
  // 마을에 들어올 때까지 (느린 환경에서 포탈 직후) 잠깐 기다림
  await page.waitForFunction(() => document.body.classList.contains("in-lobby") && !!window.RLTownPos?.(), null, { timeout: 8000 }).catch(() => { throw new Error(`goDoor(${id}): not in the town`); });
  const ok = await page.evaluate(async (id) => {
    const d = window.RLJump.TOWN.doors.find(q => q.id === id);
    const fire = (type, key) => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 200; i++) {
      const p = window.RLTownPos?.();
      if (!p) { await wait(50); continue; }
      const dx = d.x - p.x, far = Math.abs(dx);
      if (far < 0.3 && p.ground && Math.abs(p.vx) < 0.05) return true;
      if (far < 0.3) { await wait(60); continue; }
      const k = dx > 0 ? "ArrowRight" : "ArrowLeft";
      fire("keydown", k); await wait(far > 2 ? (far - 0.9) / 7.5 * 1000 : Math.max(16, far * 70)); fire("keyup", k);
      await wait(far > 2 ? 120 : 160);
    }
    return false;
  }, id);
  if (!ok) throw new Error(`goDoor(${id}): could not reach the door`);
  if (enter) { await page.keyboard.press("ArrowUp"); await sleep(250); }
}
// 마을에 있는지 (옆에서 보는 로비)
export const inTown = (page) => page.evaluate(() => document.body.classList.contains("in-lobby"));
