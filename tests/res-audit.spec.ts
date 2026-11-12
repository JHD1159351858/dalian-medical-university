import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

type Vec3 = [number, number, number];
type SceneSnapshot = {
  phase?: string; eligible?: boolean; walking?: boolean; position?: Vec3;
  patient?: { position: Vec3 };
  doctor?: { position: Vec3 };
  camera?: { position: Vec3; target: Vec3 };
};

const OUT = path.join('verification', 'res-audit');
const scene = (page: Page) => page.evaluate(() => (window as any).__hospitalScene as SceneSnapshot | undefined);

const VIEWPORTS = [
  { tag: '1366', width: 1366, height: 768 },
  { tag: '1920', width: 1920, height: 1080 },
  { tag: '2560', width: 2560, height: 1440 },
];

async function metrics(page: Page) {
  return page.evaluate(() => ({
    iw: innerWidth,
    ih: innerHeight,
    sw: document.documentElement.scrollWidth,
    sh: document.documentElement.scrollHeight,
    bodySw: document.body?.scrollWidth ?? 0,
    bodySh: document.body?.scrollHeight ?? 0,
    hOverflow: document.documentElement.scrollWidth > innerWidth + 2,
    vOverflow: document.documentElement.scrollHeight > innerHeight + 2,
  }));
}

async function snap(page: Page, name: string, report: string[]) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const m = await metrics(page);
  const line = `[${name}] iw=${m.iw} ih=${m.ih} sw=${m.sw} sh=${m.sh} hOverflow=${m.hOverflow} vOverflow=${m.vOverflow}`;
  console.log(line);
  report.push(line);
}

async function waitForWaitingPatient(page: Page) {
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 60_000 }).toBe('waiting');
}

async function walkDoctorToPatient(page: Page) {
  const held = new Set<string>();
  const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); };
  try {
    for (let attempt = 0; attempt < 75; attempt++) {
      const state = await scene(page);
      if (!state?.doctor || !state.patient || !state.camera) throw new Error('no telemetry');
      if (state.eligible) return;
      const [dx, dz] = [state.patient.position[0] - state.doctor.position[0], state.patient.position[2] - state.doctor.position[2]];
      const fl = Math.hypot(state.camera.target[0] - state.camera.position[0], state.camera.target[2] - state.camera.position[2]);
      const forward: [number, number] = [(state.camera.target[0] - state.camera.position[0]) / fl, (state.camera.target[2] - state.camera.position[2]) / fl];
      const right: [number, number] = [-forward[1], forward[0]];
      const fd = dx * forward[0] + dz * forward[1];
      const rd = dx * right[0] + dz * right[1];
      const keys = [fd > 0.08 ? 'w' : fd < -0.08 ? 's' : '', rd > 0.08 ? 'd' : rd < -0.08 ? 'a' : ''].filter(Boolean);
      await release();
      for (const key of keys) { await page.keyboard.down(key); held.add(key); }
      await page.waitForTimeout(170);
    }
  } finally { await release(); }
  throw new Error('doctor did not reach patient');
}

async function clickFirst(page: Page, names: (string | RegExp)[]) {
  for (const name of names) {
    const btn = page.getByRole('button', { name }).first();
    if (await btn.count() && await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 5_000 });
      return name.toString();
    }
  }
  throw new Error(`no clickable among ${names.join(', ')}`);
}

for (const vp of VIEWPORTS) {
  test(`res-audit ${vp.tag}x${vp.height}`, async ({ page }) => {
    test.setTimeout(420_000);
    fs.mkdirSync(OUT, { recursive: true });
    const report: string[] = [];
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // 1. 首页
    await page.goto('/');
    await page.getByRole('button', { name: '开始实训', exact: true }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2500);
    await snap(page, `${vp.tag}_01_home`, report);

    // 2. 进入 3D 场景
    await page.getByRole('button', { name: '开始实训', exact: true }).click();
    await expect.poll(async () => (await scene(page))?.phase, { timeout: 60_000 }).toMatch(/walking|waiting/);
    const mute = page.getByRole('button', { name: '静音', exact: true });
    if (await mute.isVisible().catch(() => false)) await mute.click();
    await snap(page, `${vp.tag}_02_scene_walking`, report);

    // 3. 走向患者并接诊
    await waitForWaitingPatient(page);
    await snap(page, `${vp.tag}_03_waiting`, report);
    await walkDoctorToPatient(page);
    await page.keyboard.press('f');
    await page.getByRole('button', { name: '开始问诊', exact: true }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    await snap(page, `${vp.tag}_04_dialog`, report);

    // 4. 问诊页
    await page.getByRole('button', { name: '开始问诊', exact: true }).click();
    await page.getByLabel('问诊训练台').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await snap(page, `${vp.tag}_05_diagnosis`, report);

    // 5. 体格检查页
    await clickFirst(page, ['开始体格检查']);
    await page.getByLabel('体格检查训练台').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await snap(page, `${vp.tag}_06_exam`, report);

    // 6. 四诊页
    await clickFirst(page, [/四诊/, '进入中医四诊']);
    await page.locator('.four-workspace').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await snap(page, `${vp.tag}_07_four`, report);

    // 7. 辅助检查页
    await clickFirst(page, ['进入辅助检查', /辅助检查/]);
    await page.locator('.aux-workspace').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await snap(page, `${vp.tag}_08_aux`, report);

    // 8. 诊断记录页
    await clickFirst(page, ['进入诊断']);
    await page.locator('.clinical-diagnosis-workspace').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await snap(page, `${vp.tag}_09_clinical_diagnosis`, report);

    // 9. 处置方案页
    await clickFirst(page, ['进入处置']);
    await page.locator('.treatment-workspace').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await snap(page, `${vp.tag}_10_treatment`, report);

    fs.writeFileSync(path.join(OUT, `${vp.tag}_metrics.txt`), report.join('\n'));
  });
}
