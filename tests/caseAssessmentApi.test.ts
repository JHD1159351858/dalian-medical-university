import { createServer, type Server } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import standard from '../server/case-standard.json';
import { createApp } from '../server/index.mjs';

const servers: Server[] = [];
const reference = () => structuredClone(standard.referenceSubmission);
const blank = () => ({ caseId: 'wang-xu', snapshot: { messages: [], fourDiagnosis: {}, auxiliaryExam: {}, clinicalDiagnosis: {}, treatment: { treatments: [], medications: [] }, physicalExam: null } });
type Adapter = 'express' | 'next';

async function assess(adapter: Adapter, body: unknown) {
  const options = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  if (adapter === 'next') {
    const route = await import('../src/app/api/case-assessment/route');
    return route.POST(new Request('http://localhost/api/case-assessment', options));
  }
  const server = createServer(createApp({ env: {} }));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  return fetch(`http://127.0.0.1:${address.port}/api/case-assessment`, options);
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

it.each(['express', 'next'] as const)('%s gives the checked-in reference exactly 100 without claiming teacher approval', async (adapter) => {
  const response = await assess(adapter, reference());
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ caseId: 'wang-xu', source: 'case_reference', teacherApproved: false, score: 100, maxScore: 100 });
  expect(result.modules.map((module: { score: number }) => module.score)).toEqual([20, 15, 15, 10, 20, 20]);
});

it.each(['express', 'next'] as const)('%s gives blank work zero and ignores client scores or correctness claims', async (adapter) => {
  const response = await assess(adapter, { ...blank(), score: 100, teacherApproved: true, submissions: [{ kind: 'pulse', payload: { correct: true, result: { score: 100 } } }] });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ score: 0, maxScore: 100, teacherApproved: false });
});

it.each(['express', 'next'] as const)('%s deducts a negated diagnosis and conflicting jaundice findings', async (adapter) => {
  for (const field of ['primary', 'skin'] as const) {
    const body = reference();
    if (field === 'primary') body.snapshot.clinicalDiagnosis.primary = body.snapshot.clinicalDiagnosis.primary.replace('急性重症胰腺炎', '不是急性重症胰腺炎');
    else body.snapshot.physicalExam.notes.skin += '；皮肤黄染，巩膜黄染。';
    const response = await assess(adapter, body);
    const result = await response.json();
    expect(result.score).toBeLessThan(100);
    expect(result.modules.find((module: { id: string }) => module.id === (field === 'primary' ? 'clinicalDiagnosis' : 'physicalExam')).score).toBeLessThan(field === 'primary' ? 20 : 15);
  }
});

it.each(['express', 'next'] as const)('%s deducts an incorrect dose using the existing treatment rules', async (adapter) => {
  const body = reference();
  body.snapshot.treatment.medications[0].dose = '41mg bid';
  const result = await (await assess(adapter, body)).json();
  expect(result.score).toBeLessThan(100);
  expect(result.modules.find((module: { id: string }) => module.id === 'treatment').score).toBeLessThan(20);
});

it.each(['express', 'next'] as const)('%s evaluates field meanings rather than full-object equality or assistant answers', async (adapter) => {
  const body = reference();
  body.snapshot.clinicalDiagnosis.primary = body.snapshot.clinicalDiagnosis.primary.replace('急性重症胰腺炎', '重症急性胰腺炎');
  body.snapshot.fourDiagnosis.feel = '脉象：沉、滑、数；左上腹压痛；反跳痛阴性。';
  body.snapshot.treatment.medications[0].dose = '0.04g 每天两次';
  expect(await (await assess(adapter, body)).json()).toMatchObject({ score: 100 });
  body.snapshot.messages = body.snapshot.messages.map((message) => ({ ...message, role: 'assistant' }));
  const withoutQuestions = await (await assess(adapter, body)).json();
  expect(withoutQuestions.modules[0].score).toBe(0);
});

it.each(['express', 'next'] as const)('%s rejects malformed or unknown-case requests without returning a fabricated grade', async (adapter) => {
  expect((await assess(adapter, { caseId: 'other', snapshot: blank().snapshot })).status).toBe(404);
  expect((await assess(adapter, { caseId: 'wang-xu', snapshot: {} })).status).toBe(400);
});
