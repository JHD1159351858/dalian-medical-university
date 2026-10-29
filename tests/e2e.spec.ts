import { expect, test, type Page, type Route } from '@playwright/test';
import { PATIENT_OPENING } from '../src/clinical/caseData';

type Vec3 = [number, number, number];
type SceneSnapshot = {
  phase?: string; eligible?: boolean; walking?: boolean; position?: Vec3;
  patient?: { position: Vec3; quaternion: number[]; joints: Record<string, number[]> };
  doctor?: { position: Vec3; quaternion: number[]; joints: Record<string, number[]> };
  doors?: { leftAngle: number; rightAngle: number; action: string; manualOpen: boolean };
  camera?: { position: Vec3; target: Vec3; quaternion: number[]; zoom: number; frustum: number[]; canvasSize: number[] };
};

const scene = (page: Page) => page.evaluate(() => (window as any).__hospitalScene as SceneSnapshot | undefined);
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

test('town homepage animates and hands off to the existing hospital', async ({ page }) => {
  const models: string[] = [];
  page.on('request', request => { if (request.url().includes('/models/')) models.push(request.url()); });
  await page.goto('/');
  const start = page.getByRole('button', { name: '开始实训', exact: true });
  await expect(start).toBeVisible();
  await expect(page.getByLabel('首页品牌')).toContainText('大连医科大学');
  await expect(page.getByLabel('首页品牌')).toContainText('临床问诊实训');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('走进医院成为接诊医生');
  await expect(page.locator('.town-motto')).toContainText('厚德尚医');
  await expect(page.locator('.town-motto')).toContainText('笃行致远');
  await expect(page.getByText('临床思维训练', { exact: true })).toBeVisible();
  await expect(page.getByText('典型案例库', { exact: true })).toBeVisible();
  await expect(page.getByText('能力评估反馈', { exact: true })).toBeVisible();
  await expect(page.getByText('教学模拟环境', { exact: true })).toBeVisible();
  await expect(page.locator('.town-home')).toHaveCSS('background-image', /home-background/);
  await page.waitForFunction(() => Boolean((window as any).__townScene?.ready));
  expect(models.some(url => /\/(doctor|patient|hospital)\.glb/.test(url))).toBe(false);
  const before = await page.evaluate(() => (window as any).__townScene);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => (window as any).__townScene);
  expect(after.carPosition).not.toEqual(before.carPosition);
  expect(after.pedestrianPosition).not.toEqual(before.pedestrianPosition);
  await start.click();
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 40_000 }).toMatch(/walking|waiting/);
  await expect(page.locator('.town-home')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__townScene)).toBeUndefined();
  await waitForWaitingPatient(page);
});

test('starting training performs an aerial dive before switching scenes', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as any).__townScene?.ready));
  await page.getByRole('button', { name: '开始实训', exact: true }).click();
  await expect(page.getByText('正在进入医院', { exact: true })).toBeVisible();
  const first = await page.evaluate(() => (window as any).__townScene);
  expect(first.transitioning).toBe(true);
  expect(first.transitionProgress).toBeGreaterThanOrEqual(0);
  await page.waitForTimeout(450);
  const middle = await page.evaluate(() => (window as any).__townScene);
  expect(middle.transitionProgress).toBeGreaterThan(first.transitionProgress);
  await expect.poll(async () => (await page.evaluate(() => (window as any).__townScene))?.transitioning ?? false, { timeout: 5_000 }).toBe(false);
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 40_000 }).toMatch(/walking|waiting/);
});

async function readGlState(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')!;
    return { viewport: Array.from(context.getParameter(context.VIEWPORT) as Int32Array), scissor: Array.from(context.getParameter(context.SCISSOR_BOX) as Int32Array), enabled: context.isEnabled(context.SCISSOR_TEST), size: [canvas.width, canvas.height] };
  });
}

const hasFullViewport = (gl: Awaited<ReturnType<typeof readGlState>>) =>
  !gl.enabled && gl.viewport.join() === [0, 0, ...gl.size].join() && gl.scissor.join() === [0, 0, ...gl.size].join();

async function waitForScene(page: Page) { await expect.poll(() => scene(page)).toBeTruthy(); }

async function startArrival(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '开始实训', exact: true }).click();
  await page.getByRole('button', { name: '静音', exact: true }).waitFor();
  const mute = page.getByRole('button', { name: '静音', exact: true });
  if (await mute.isVisible()) await mute.click();
  await waitForScene(page);
}

async function waitForWaitingPatient(page: Page) {
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 40_000 }).toBe('waiting');
}

/** Keyboard-only movement. Scene telemetry selects camera-relative keys but never changes state. */
async function walkDoctorToPatient(page: Page) {
  const held = new Set<string>();
  let firstJoints: Record<string, number[]> | undefined;
  const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); };
  try {
    for (let attempt = 0; attempt < 75; attempt++) {
      const state = await scene(page);
      if (!state?.doctor || !state.patient || !state.camera) throw new Error('doctor navigation telemetry is unavailable');
      firstJoints ??= state.doctor.joints;
      if (state.eligible) return { firstJoints, finalJoints: state.doctor.joints };
      const [dx, dz] = [state.patient.position[0] - state.doctor.position[0], state.patient.position[2] - state.doctor.position[2]];
      const forwardLength = Math.hypot(state.camera.target[0] - state.camera.position[0], state.camera.target[2] - state.camera.position[2]);
      const forward: [number, number] = [(state.camera.target[0] - state.camera.position[0]) / forwardLength, (state.camera.target[2] - state.camera.position[2]) / forwardLength];
      const right: [number, number] = [-forward[1], forward[0]];
      const forwardDot = dx * forward[0] + dz * forward[1];
      const rightDot = dx * right[0] + dz * right[1];
      const keys = [forwardDot > 0.08 ? 'w' : forwardDot < -0.08 ? 's' : '', rightDot > 0.08 ? 'd' : rightDot < -0.08 ? 'a' : ''].filter(Boolean);
      await release();
      for (const key of keys) { await page.keyboard.down(key); held.add(key); }
      await page.waitForTimeout(170);
    }
  } finally { await release(); }
  const state = await scene(page);
  throw new Error(`doctor did not reach patient; distance ${state?.doctor && state.patient ? distance(state.doctor.position, state.patient.position).toFixed(2) : 'unknown'}`);
}

async function useInteractionKey(page: Page) {
  await page.keyboard.press('f');
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 15_000 }).not.toBe('waiting');
}

/** Follow an empty-aisle waypoint using real camera-relative keyboard input. */
async function walkDoctorToPoint(page: Page, target: Vec3) {
  const held = new Set<string>();
  const release = async () => { for (const key of held) await page.keyboard.up(key); held.clear(); };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await scene(page);
      if (!state?.doctor || !state.camera) throw new Error('doctor navigation telemetry is unavailable');
      if (distance(state.doctor.position, target) < 0.1) return;
      const dx = target[0] - state.doctor.position[0], dz = target[2] - state.doctor.position[2];
      const fx = state.camera.target[0] - state.camera.position[0], fz = state.camera.target[2] - state.camera.position[2];
      const length = Math.hypot(fx, fz);
      const forwardDot = (dx * fx + dz * fz) / length;
      const rightDot = (-dx * fz + dz * fx) / length;
      const keys = [forwardDot > 0.06 ? 'w' : forwardDot < -0.06 ? 's' : '', rightDot > 0.06 ? 'd' : rightDot < -0.06 ? 'a' : ''].filter(Boolean);
      await release();
      for (const key of keys) { await page.keyboard.down(key); held.add(key); }
      await page.waitForTimeout(100);
    }
    throw new Error(`doctor did not reach ${target}: ${JSON.stringify((await scene(page))?.doctor?.position)}`);
  } finally { await release(); }
}

async function enterDiagnosis(page: Page) {
  await startArrival(page);
  await waitForWaitingPatient(page);
  await walkDoctorToPatient(page);
  await useInteractionKey(page);
  await page.getByRole('button', { name: '开始问诊', exact: true }).click({ timeout: 30_000 });
  await page.getByLabel('问诊训练台').waitFor({ timeout: 15_000 });
}

function installChatFixture(page: Page) {
  const histories: Array<Array<{ role: string; content: string }>> = [];
  return Promise.all([
    page.route('**/api/health', (route) => route.fulfill({ json: { configured: true } })),
    page.route('**/api/chat', async (route) => {
      histories.push(route.request().postDataJSON().messages);
      if (histories.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        return route.fulfill({ status: 502, json: { error: '测试：服务暂时不可用。' } });
      }
      const reply = histories.length === 2 ? '左上腹疼了两天，一直没有缓解。' : '没有恶心和呕吐，就是肚子胀，还有点气短。';
      return route.fulfill({ contentType: 'text/event-stream', body: `event: delta\ndata: ${JSON.stringify({ text: reply })}\n\nevent: done\ndata: ${JSON.stringify({ reply })}\n\n` });
    }),
  ]).then(() => histories);
}

test('patient uses the entrance doors, and early, held, and repeated F do not start consultation', async ({ page }) => {
  test.setTimeout(150_000);
  await startArrival(page);
  await page.keyboard.press('f');
  await page.keyboard.press('f');
  const first = await scene(page);
  expect(first?.walking).toBe(true);
  expect(first?.patient?.joints && Object.keys(first.patient.joints).length).toBeGreaterThanOrEqual(6);
  await page.waitForTimeout(380);
  const moving = await scene(page);
  expect(moving?.patient?.position).not.toEqual(first?.patient?.position);
  expect(moving?.patient?.joints).not.toEqual(first?.patient?.joints);
  await expect.poll(async () => {
    const doors = (await scene(page))?.doors;
    return doors ? Math.max(Math.abs(doors.leftAngle), Math.abs(doors.rightAngle)) : 0;
  }, { timeout: 20_000 }).toBeGreaterThan(0.1);
  await waitForWaitingPatient(page);
  const waiting = await scene(page);
  expect(waiting?.patient && waiting.doctor).toBeTruthy();
  expect(distance(waiting!.patient!.position, waiting!.doctor!.position)).toBeGreaterThan(1.2);
  expect(waiting?.eligible).toBe(false);
  await page.keyboard.down('f');
  await page.waitForTimeout(1_100);
  await page.keyboard.up('f');
  await expect.poll(async () => (await scene(page))?.phase).toBe('waiting');
  await page.waitForTimeout(30_000);
  await expect.poll(async () => (await scene(page))?.phase).toBe('waiting');
  await expect.poll(async () => {
    const doors = (await scene(page))?.doors;
    return doors ? Math.max(Math.abs(doors.leftAngle), Math.abs(doors.rightAngle)) : Infinity;
  }).toBeLessThan(0.02);
  // A key held while out of range must not turn into consent on approach.
  await page.keyboard.down('f');
  const doctorMotion = await walkDoctorToPatient(page);
  expect(doctorMotion?.firstJoints && Object.keys(doctorMotion.firstJoints).length).toBeGreaterThanOrEqual(6);
  expect(doctorMotion?.finalJoints).not.toEqual(doctorMotion?.firstJoints);
  await expect.poll(async () => (await scene(page))?.eligible).toBe(true);
  await page.keyboard.down('f'); // repeat=true while the same physical key is held
  await page.waitForTimeout(500);
  expect((await scene(page))?.phase).toBe('waiting');
  await page.keyboard.up('f');
  await useInteractionKey(page);
  await expect(page.getByText(PATIENT_OPENING, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始问诊', exact: true }).waitFor({ timeout: 30_000 });
  await page.keyboard.press('f');
  await expect(page.getByRole('button', { name: '开始问诊', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始问诊', exact: true }).click();
  await expect(page.locator('.message-assistant')).toHaveCount(1);
  await expect(page.locator('.message-assistant').first()).toContainText(PATIENT_OPENING);
});

test('failed chat retries, back preserves state, and F resumes diagnosis without repeating the opening', async ({ page }) => {
  const histories = await installChatFixture(page);
  await enterDiagnosis(page);
  const input = page.getByRole('textbox', { name: '向患者提问' });
  await input.fill('您哪里不舒服，多久了？');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect(page.locator('.message-user')).toContainText('您哪里不舒服，多久了？');
  await expect(page.getByRole('alert')).toContainText('测试：服务暂时不可用');
  await expect(input).toHaveValue('您哪里不舒服，多久了？');
  await input.press('Enter');
  await expect(page.locator('.message-assistant').last()).toContainText('左上腹疼了两天');
  await input.fill('还有恶心或呕吐吗？');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('还有恶心或呕吐吗？\n');
  expect(histories).toHaveLength(2);
  await input.press('Enter');
  await expect(page.locator('.message-assistant').last()).toContainText('没有恶心和呕吐');
  expect(histories[2].map((message) => message.role)).toEqual(['assistant', 'user', 'assistant', 'user']);
  expect(histories[2][0]).toEqual({ role: 'assistant', content: PATIENT_OPENING });
  const beforeBack = await scene(page);
  await page.getByRole('button', { name: '返回场景' }).click();
  await waitForWaitingPatient(page);
  const afterBack = await scene(page);
  await expect(page.getByText('有病人前来就诊', { exact: true })).toHaveCount(0);
  expect(afterBack?.patient?.position).toEqual(beforeBack?.patient?.position);
  expect(afterBack?.doctor?.position).toEqual(beforeBack?.doctor?.position);
  await useInteractionKey(page);
  await expect(page.getByRole('button', { name: '继续问诊', exact: true })).toBeVisible();
  await expect(page.getByText(PATIENT_OPENING, { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '继续问诊', exact: true }).click();
  await expect(page.locator('.message-assistant')).toHaveCount(3);
  await expect(page.locator('.message-assistant').first()).toContainText(PATIENT_OPENING);
  await page.getByRole('button', { name: '重置训练' }).click();
  await expect(page.getByRole('button', { name: '进入医院', exact: true })).toBeVisible();
});

test('a sent question appears immediately and the patient answer grows with the stream', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { configured: true } }));
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (input !== '/api/chat') return originalFetch(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          (window as any).__chatPush = (frame: string) => {
            controller.enqueue(encoder.encode(frame));
            if (frame.includes('event: done')) controller.close();
          };
        },
      });
      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    };
  });
  await enterDiagnosis(page);
  const input = page.getByRole('textbox', { name: '向患者提问' });
  await input.fill('哪里疼？');
  await input.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Enter', bubbles: true, cancelable: true, isComposing: true,
  })));
  await expect(input).toHaveValue('哪里疼？');
  await expect(page.locator('.message-user')).toHaveCount(0);

  await input.press('Enter');
  await expect(page.locator('.message-user')).toHaveText(/哪里疼？/);
  await expect(page.locator('.message-assistant')).toHaveCount(1);
  await page.waitForFunction(() => typeof (window as any).__chatPush === 'function');
  await page.evaluate(() => (window as any).__chatPush('event: delta\ndata: {"text":"左"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('左');
  await expect(page.locator('.conversation-topline')).toContainText('患者正在回答');
  await page.evaluate(() => (window as any).__chatPush('event: delta\ndata: {"text":"上腹疼"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('左上腹疼');
  await page.evaluate(() => (window as any).__chatPush('event: done\ndata: {"reply":"左上腹疼了两天。"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('左上腹疼了两天。');
});

test('spoken answer text streams independently of audio and continues after stopping voice', async ({ page }) => {
  await page.route('**/api/health', (route) => route.fulfill({ json: { configured: true } }));
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const OriginalSocket = window.WebSocket;
    const sockets: any[] = [];
    (window as any).__speechSockets = sockets;
    (window as any).__readySpeech = () => {
      const socket = sockets.at(-1);
      socket.readyState = 1;
      socket.onopen?.();
      socket.emit({ type: 'ready', sampleRate: 24000 });
    };
    (window as any).__audioSpeech = () => sockets.at(-1).emit({ type: 'audio', data: btoa('\0'.repeat(4800)) });
    class SpeechSocket {
      readyState = 0;
      sent: object[] = [];
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(url: string, protocols?: string | string[]) {
        if (!url.includes('/api/speech-stream')) return new OriginalSocket(url, protocols) as any;
        sockets.push(this);
      }
      send(data: string) { this.sent.push(JSON.parse(data)); }
      emit(message: object) { this.onmessage?.({ data: JSON.stringify(message) }); }
      close() { this.readyState = 3; this.onclose?.(); }
    }
    window.WebSocket = SpeechSocket as unknown as typeof WebSocket;
    window.fetch = (input, init) => {
      if (input !== '/api/chat') return originalFetch(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          (window as any).__pushChat = (frame: string) => {
            controller.enqueue(encoder.encode(frame));
            if (frame.includes('event: done')) controller.close();
          };
        },
      });
      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'text/event-stream' } }));
    };
  });

  await enterDiagnosis(page);
  await page.getByRole('button', { name: '开启语音' }).click();
  const input = page.getByRole('textbox', { name: '向患者提问' });
  await input.fill('哪里疼？');
  await input.press('Enter');
  await page.waitForFunction(() => typeof (window as any).__pushChat === 'function');
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"左"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('左');
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"上腹疼，"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('左上腹疼，');
  await expect(page.locator('.message-user')).toContainText('哪里疼？');

  await page.evaluate(() => { (window as any).__readySpeech(); (window as any).__audioSpeech(); });
  await page.getByRole('button', { name: '停止朗读' }).click();
  expect(await page.evaluate(() => (window as any).__speechSockets[0].readyState)).toBe(3);
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"两天了。"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('左上腹疼，两天了。');
  await page.evaluate(() => (window as any).__pushChat('event: done\ndata: {"reply":"左上腹疼，两天了。"}\n\n'));
  await expect(page.locator('.conversation-topline')).toContainText('请围绕主诉继续追问');

  await input.fill('还有别的不舒服吗？');
  await input.press('Enter');
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"有点头晕，"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('有点头晕，');
  await page.evaluate(() => { (window as any).__readySpeech(); (window as any).__audioSpeech(); });
  await page.getByRole('button', { name: '静音', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__speechSockets.at(-1).readyState)).toBe(3);
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"还发热。"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('有点头晕，还发热。');
  await page.evaluate(() => (window as any).__pushChat('event: done\ndata: {"reply":"有点头晕，还发热。"}\n\n'));
  await expect(page.locator('.conversation-topline')).toContainText('请围绕主诉继续追问');

  await page.getByRole('button', { name: '开启语音' }).click();
  await input.fill('什么时候开始的？');
  await input.press('Enter');
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"昨天，"}\n\n'));
  await page.evaluate(() => { (window as any).__readySpeech(); (window as any).__audioSpeech(); });
  await expect(page.locator('.message-assistant').last()).toContainText('昨天，');
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"开始，现在更疼了。"}\n\n'));
  await page.evaluate(() => (window as any).__pushChat('event: done\ndata: {"reply":"昨天开始，现在更疼了。"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('昨天开始，现在更疼了。');
  await page.getByRole('button', { name: '停止朗读' }).click();
  await expect(page.locator('.conversation-topline')).toContainText('请围绕主诉继续追问');

  await input.fill('再描述一下疼痛？');
  await input.press('Enter');
  await page.evaluate(() => (window as any).__speechSockets.at(-1).emit({ type: 'error', error: '语音服务暂时不可用。' }));
  await page.evaluate(() => (window as any).__pushChat('event: delta\ndata: {"text":"还是左上腹疼。"}\n\n'));
  await expect(page.locator('.message-assistant').last()).toContainText('还是左上腹疼。');
  await page.evaluate(() => (window as any).__pushChat('event: done\ndata: {"reply":"还是左上腹疼。"}\n\n'));
  await expect(page.locator('.conversation-topline')).toContainText('请围绕主诉继续追问');

  await input.fill('疼痛持续吗？');
  await input.press('Enter');
  await page.evaluate(() => { (window as any).__readySpeech(); (window as any).__audioSpeech(); });
  await page.getByRole('button', { name: '返回场景' }).click();
  expect(await page.evaluate(() => (window as any).__speechSockets.at(-1).readyState)).toBe(3);
});

test.describe('the WebGL drawing buffer returns to the full viewport after diagnosis', () => {
  test.use({ deviceScaleFactor: 2 });
  test('three returns and a resize leave one full-size unscissored canvas', async ({ page }) => {
    test.setTimeout(120_000);
    await installChatFixture(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await enterDiagnosis(page);
    for (let pass = 0; pass < 3; pass++) {
      if (pass === 1) await page.setViewportSize({ width: 1440, height: 900 });
      if (pass === 2) await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.getByRole('button', { name: '返回场景' }).click();
      await waitForWaitingPatient(page);
      await expect.poll(() => readGlState(page).then(hasFullViewport), { timeout: 15_000 }).toBe(true);
      const gl = await readGlState(page);
      expect(gl.viewport).toEqual([0, 0, ...gl.size]);
      expect(gl.scissor).toEqual([0, 0, ...gl.size]);
      expect(gl.enabled).toBe(false);
      await expect.poll(async () => {
        const camera = (await scene(page))?.camera;
        if (!camera?.frustum || !camera.canvasSize) return false;
        const [left, right, top, bottom] = camera.frustum;
        const [width, height] = camera.canvasSize;
        return Math.abs(right - left - width) < 0.01 && Math.abs(top - bottom - height) < 0.01;
      }).toBe(true);
      await page.screenshot({ path: `verification/e2e-return-${pass + 1}.png` });
      await useInteractionKey(page);
      await page.getByRole('button', { name: '继续问诊', exact: true }).click();
      await expect(page.getByLabel('问诊训练台')).toBeVisible();
    }
  });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`keyboard movement works at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await startArrival(page);
    const before = await scene(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(350);
    await page.keyboard.up('ArrowUp');
    const after = await scene(page);
    expect(after?.doctor?.position).not.toEqual(before?.doctor?.position);
    expect(distance(after!.doctor!.position, before!.doctor!.position)).toBeGreaterThan(0.22);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test.describe('player entrance interaction', () => {
  test.use({ hasTouch: true });
  test('F and the touch button control doors without automatic opening or unsafe closing', async ({ page }) => {
    // With the unchanged initial camera, S+A walks toward the entrance and faces it.
    const towardDoor = async (duration: number) => {
      await page.keyboard.down('s');
      await page.keyboard.down('a');
      await page.waitForTimeout(duration);
      await page.keyboard.up('s');
      await page.keyboard.up('a');
    };
    await startArrival(page);
    await waitForWaitingPatient(page);
    await expect.poll(async () => (await scene(page))?.doors?.leftAngle).toBeLessThan(0.02);
    await walkDoctorToPoint(page, [0, 0.031, 1.2]);
    await walkDoctorToPoint(page, [0, 0.031, 3.3]);
    await towardDoor(300);
    await expect(page.locator('.keyboard-interact')).toContainText('开门');
    await page.waitForTimeout(700);
    expect((await scene(page))?.doors?.leftAngle).toBeLessThan(0.02);
    await page.keyboard.press('f');
    await expect.poll(async () => (await scene(page))?.doors?.leftAngle).toBeGreaterThan(1.45);
    expect((await scene(page))?.doors?.manualOpen).toBe(true);
    await towardDoor(650);
    await expect(page.locator('.keyboard-interact')).toContainText('门区有人');
    await page.keyboard.press('f');
    expect((await scene(page))?.doors?.manualOpen).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: '门区有人', exact: true })).toBeDisabled();
    await walkDoctorToPoint(page, [0, 0.031, 3.3]);
    await towardDoor(300);
    const close = page.getByRole('button', { name: '关门', exact: true });
    await expect(close).toBeEnabled();
    await close.tap();
    await expect.poll(async () => (await scene(page))?.doors?.leftAngle).toBeLessThan(0.02);
    expect((await scene(page))?.doors?.manualOpen).toBe(false);
    expect((await scene(page))?.phase).toBe('waiting');
    await page.getByRole('button', { name: '开门', exact: true }).tap();
    await expect.poll(async () => (await scene(page))?.doors?.leftAngle).toBeGreaterThan(1.45);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('touch movement controls', () => {
  test.use({ hasTouch: true });
  for (const viewport of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    test(`multi-touch joystick movement works at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await startArrival(page);
      const joystick = page.getByRole('application', { name: '医生移动摇杆' });
      await expect(joystick).toBeVisible();
      const box = await joystick.boundingBox();
      expect(box).toBeTruthy();
      const cdp = await page.context().newCDPSession(page);
      const beforeTouch = await scene(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2, id: 1 }, { x: box!.x + box!.width * 0.8, y: box!.y + box!.height * 0.2, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box!.x + box!.width * 0.8, y: box!.y + box!.height / 2, id: 1 }, { x: box!.x + box!.width * 0.8, y: box!.y + box!.height * 0.2, id: 2 }] });
      await page.waitForTimeout(350);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const afterTouch = await scene(page);
      expect(afterTouch?.doctor?.position).not.toEqual(beforeTouch?.doctor?.position);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (viewport.width === 390) {
        await waitForWaitingPatient(page);
        await walkDoctorToPatient(page);
        const reception = page.getByRole('button', { name: '接诊', exact: true });
        await expect(reception).toBeEnabled();
        await reception.tap();
        await page.getByRole('button', { name: '开始问诊', exact: true }).click({ timeout: 30_000 });
        await expect(page.getByLabel('问诊训练台')).toBeVisible();
        const patient = await page.getByLabel('患者三维形象').boundingBox();
        const doctor = await page.getByLabel('医生三维形象').boundingBox();
        expect(patient?.x).toBeLessThan(doctor?.x ?? 0);
        await page.getByRole('textbox', { name: '向患者提问' }).scrollIntoViewIfNeeded();
        await expect(page.getByRole('button', { name: '发送问题' })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.getByRole('button', { name: '返回场景' }).click();
        await waitForWaitingPatient(page);
      }
    });
  }
});

test('ending reception sends the patient out through the doors before the next round', async ({ page }) => {
  test.setTimeout(120_000);
  await installChatFixture(page);
  await enterDiagnosis(page);
  const beforeExit = await scene(page);
  await page.getByRole('button', { name: '结束接诊', exact: true }).click();
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 15_000 }).toBe('exiting');
  await expect.poll(async () => {
    const doors = (await scene(page))?.doors;
    return doors ? Math.max(Math.abs(doors.leftAngle), Math.abs(doors.rightAngle)) : 0;
  }, { timeout: 15_000 }).toBeGreaterThan(0.1);
  await expect.poll(async () => (await scene(page))?.phase, { timeout: 40_000 }).toBe('completed');
  const completed = await scene(page);
  expect(completed?.patient?.position).not.toEqual(beforeExit?.patient?.position);
  await expect.poll(async () => {
    const doors = (await scene(page))?.doors;
    return doors ? Math.max(Math.abs(doors.leftAngle), Math.abs(doors.rightAngle)) : Infinity;
  }).toBeLessThan(0.02);
  await expect(page.getByRole('button', { name: '开始下一轮', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '开始下一轮', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入医院', exact: true })).toBeVisible();
});

test('failed model download can be retried', async ({ page }) => {
  let fail = true;
  await page.route('**/models/patient.glb', (route) => fail ? route.fulfill({ status: 503, body: 'test failure' }) : route.continue());
  await page.goto('/');
  await page.getByRole('button', { name: '开始实训', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('三维资源加载失败');
  fail = false;
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect.poll(async () => (await scene(page))?.phase).toMatch(/walking|waiting/);
});

test('muting while the patient is thinking also mutes the eventual reply', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel() {}, getVoices: () => [], speak(utterance: SpeechSynthesisUtterance) { (window as any).__spoken.push(utterance.text); } } });
  });
  await page.route('**/api/health', (route) => route.fulfill({ json: { configured: true } }));
  let pending: Route | undefined;
  await page.route('**/api/chat', (route) => { pending = route; });
  await enterDiagnosis(page);
  await page.getByRole('button', { name: '开启语音', exact: true }).click();
  await page.getByRole('textbox', { name: '向患者提问' }).fill('腹痛多久了？');
  await page.getByRole('button', { name: '发送问题' }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.getByRole('button', { name: '静音', exact: true }).click();
  await pending!.fulfill({ json: { reply: '肚子已经疼了两天。' } });
  await expect(page.locator('.message-assistant').last()).toContainText('已经疼了两天');
  expect(await page.evaluate(() => (window as any).__spoken)).toEqual([]);
});

test('physical exam shows ordered case reports immediately and preserves per-item descriptions', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installChatFixture(page);
  await enterDiagnosis(page);
  await page.getByRole('button', { name: '开始体格检查', exact: true }).click();
  await expect(page.getByLabel('体格检查训练台')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);
  const examLayout = await page.locator('.exam-layout').boundingBox();
  expect(examLayout).toBeTruthy();
  expect(examLayout!.x).toBeLessThanOrEqual(60);
  expect(examLayout!.x + examLayout!.width).toBeGreaterThanOrEqual(1860);

  await page.getByRole('button', { name: '开具检查' }).click();
  const orderDialog = page.getByRole('dialog', { name: '开具体格检查' });
  await orderDialog.getByLabel('基本生命体征').check();
  await orderDialog.getByLabel('锁骨上淋巴结').check();
  await orderDialog.getByLabel('皮肤及巩膜').check();
  await orderDialog.getByLabel('营养状态').check();
  await orderDialog.getByLabel('呼吸').check();
  await orderDialog.getByLabel('心律').check();
  await orderDialog.getByLabel('神经系统').check();
  await orderDialog.getByLabel('下肢').check();
  await orderDialog.getByLabel('腹部视触诊').check();
  await orderDialog.getByLabel('腹部叩诊').check();
  await orderDialog.getByLabel('肠鸣音').check();
  await orderDialog.getByRole('button', { name: '确认开单' }).click();
  await expect(page.locator('.exam-check-item')).toHaveCount(11);

  for (const [label, file] of [
    ['营养状态', '营养状态.png'], ['呼吸', '呼吸.png'], ['皮肤及巩膜', '皮肤巩膜.png'],
    ['锁骨上淋巴结', '淋巴结.png'], ['神经系统', '神经.png'], ['下肢', '腿部检查.png'],
    ['腹部视触诊', '腹部.jpg'], ['腹部叩诊', '腹部叩诊.png'], ['肠鸣音', '肠鸣声.png'],
  ]) {
    await page.locator('.exam-check-item').filter({ hasText: label }).click();
    const image = page.getByRole('region', { name: '检查互动台' }).locator('img');
    await expect(image).toHaveAttribute('src', `/exam-images/${file}`);
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    await expect(image).toBeVisible();
  }
  await page.getByRole('button', { name: /心律/ }).click();
  await expect(page.getByText('请根据查看电脑中的结果填写')).toBeVisible();
  await page.getByRole('button', { name: /基本生命体征/ }).click();

  await expect(page.getByRole('region', { name: '检查互动台' })).toContainText('床旁监护仪');
  await expect(page.getByLabel('动态心电图')).toBeVisible();
  await expect(page.getByLabel('多通道监护波形').locator('.monitor-trace')).toHaveCount(4);
  await expect(page.getByLabel('生命体征读数')).toContainText('118');
  await expect(page.getByLabel('生命体征读数')).toContainText('149');
  await expect(page.getByLabel('生命体征读数')).toContainText('37.5');
  await expect(page.getByLabel('腹部九区触诊地图')).toHaveCount(0);
  await page.getByRole('button', { name: /呼吸/ }).click();
  await expect(page.getByRole('region', { name: '检查互动台' }).locator('img')).toHaveAttribute('src', '/exam-images/呼吸.png');
  await page.getByRole('button', { name: /腹部视触诊/ }).click();
  await expect(page.getByLabel('腹部九区触诊地图')).toBeVisible();
  await expect(page.getByLabel('腹部轮廓')).toBeVisible();
  await page.getByRole('button', { name: /基本生命体征/ }).click();

  await page.getByRole('button', { name: '查看电脑' }).click();
  const caseReports = page.getByRole('dialog', { name: '医院信息系统' });
  expect((await caseReports.boundingBox())!.width).toBeGreaterThanOrEqual(1700);
  await expect(caseReports).toContainText('体温 37.5℃');
  await expect(caseReports).toContainText('散在大片白色色素沉着');
  await expect(caseReports).toContainText('全腹膨隆，无胃肠型及蠕动波');
  await expect(caseReports).toContainText('中等，体型肥胖');
  await expect(caseReports.locator('.his-table article')).toHaveCount(11);
  const hisDesktop = caseReports.locator('.his-desktop');
  const hisTable = caseReports.locator('.his-table');
  const desktopHeight = (await hisDesktop.boundingBox())!.height;
  await expect.poll(() => hisTable.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  expect((await hisDesktop.boundingBox())!.height).toBe(desktopHeight);
  const reportRows = await caseReports.locator('.his-table article').evaluateAll((rows) => rows.map((row) => {
    const { top, bottom } = row.getBoundingClientRect()
    return { top, bottom }
  }));
  expect(reportRows.every((row, index) => index === 0 || row.top >= reportRows[index - 1].bottom - 1)).toBe(true);
  const computerBoundsBeforeFilter = await caseReports.boundingBox();
  const abdomenCategory = caseReports.getByRole('button', { name: '腹部', exact: true });
  await abdomenCategory.click();
  await expect(caseReports.locator('.his-table article')).toHaveCount(3);
  await expect(caseReports.locator('.his-table article').filter({ hasText: '腹部视触诊' })).toHaveCount(1);
  await abdomenCategory.click();
  await expect(caseReports.locator('.his-table article')).toHaveCount(11);
  const computerBoundsAfterFilter = await caseReports.boundingBox();
  expect(computerBoundsAfterFilter).toEqual(computerBoundsBeforeFilter);
  await caseReports.getByRole('button', { name: '关闭电脑' }).click();

  const description = page.locator('.exam-stage textarea');
  await expect(description).toHaveCount(1);
  await expect(description).toBeVisible();
  const patientCanvas = await page.locator('.exam-canvas-wrap').boundingBox();
  const descriptionBox = await description.boundingBox();
  expect(patientCanvas).toBeTruthy();
  expect(descriptionBox).toBeTruthy();
  expect(descriptionBox!.y).toBeGreaterThanOrEqual(patientCanvas!.y + patientCanvas!.height);
  await description.fill('体温 37.5℃，脉搏 118 次/分，呼吸 32 次/分，血压 149/92 mmHg。');
  await page.getByRole('button', { name: '提交本项记录' }).click();
  await expect(page.locator('.exam-note-entry')).toContainText('本项记录已提交');

  await page.getByRole('button', { name: /皮肤及巩膜/ }).click();
  await expect(description).toHaveValue('');
  await description.fill('皮肤散在大片白色色素沉着，巩膜无黄染。');
  await page.getByRole('button', { name: '提交本项记录' }).click();
  await expect(page.locator('.exam-note-entry')).toContainText('本项记录已提交');
  await page.getByRole('button', { name: /基本生命体征/ }).click();
  await expect(description).toHaveValue('体温 37.5℃，脉搏 118 次/分，呼吸 32 次/分，血压 149/92 mmHg。');
  await page.getByRole('button', { name: /皮肤及巩膜/ }).click();
  await expect(description).toHaveValue('皮肤散在大片白色色素沉着，巩膜无黄染。');

  await page.getByRole('button', { name: /腹部视触诊/ }).click();
  const abdomenImage = page.getByRole('img', { name: '腹部九区检查示意图' });
  await abdomenImage.scrollIntoViewIfNeeded();
  const abdomenBounds = (await abdomenImage.boundingBox())!;
  // Click the nine labeled regions in the supplied image, not button-derived coordinates.
  for (const [index, label] of ['右季肋区', '腹上区', '左季肋区', '右腰区', '脐区', '左腰区', '右髂区', '腹下区', '左髂区'].entries()) {
    const x = abdomenBounds.x + abdomenBounds.width * [0.34, 0.5, 0.67][index % 3];
    const y = abdomenBounds.y + abdomenBounds.height * [0.23, 0.39, 0.55][Math.floor(index / 3)];
    await page.mouse.click(x, y);
    await expect(page.locator('.exam-map-footer')).toContainText(`已定位：${label}`);
    await expect(page.locator('.exam-record p').first()).toContainText(`${label} · 压痛`);
    await expect(page.locator('.exam-feedback-card')).toContainText(index === 2 ? '左上腹压痛明显' : '按压时未诉明显疼痛');
  }
  const leftUpper = page.getByRole('button', { name: '左季肋区', exact: true });
  await leftUpper.click();
  await expect(page.locator('.exam-feedback-card')).toContainText('左上腹压痛明显');

  await leftUpper.hover();
  await page.mouse.down();
  await page.waitForTimeout(1_100);
  await page.mouse.up();
  await expect(page.locator('.exam-feedback-card')).toContainText('松开时无明显反跳痛');
  await page.screenshot({ path: 'verification/physical-exam-supplied-images.png', fullPage: true });
});
