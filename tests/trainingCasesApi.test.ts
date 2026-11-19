import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { afterAll, beforeAll, expect, it } from 'vitest';
import cases from '../server/training-cases.json';
import standard from '../server/case-standard.json';
import { createApp } from '../server/index.mjs';
import { GET as listNext } from '../src/app/api/training-cases/route';
import { POST as chatNext } from '../src/app/api/chat/route';
import { POST as assessNext } from '../src/app/api/case-assessment/route';
import { POST as treatmentNext } from '../src/app/api/treatment-evaluation/route';
import { GET as cluesNext, POST as pulseNext } from '../src/app/api/pulse-exam/route';

type Adapter = 'next' | 'express';
const server = createServer(createApp({ env: {} }));
let base: string;
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  base = 'http://127.0.0.1:' + address.port;
});
afterAll(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));

function post(adapter: Adapter, path: string, body: object, handler: (request: Request) => Promise<Response>) {
  const req = new Request(base + '/api/' + path, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  return adapter === 'next' ? handler(req) : fetch(req);
}

const notes = (items: Array<{ id?: string; label: string; result: string }>) => Object.fromEntries(items.map(({ id, label, result }) => [id ?? label, result]));
const empty = { messages: [], physicalExam: null, fourDiagnosis: {}, auxiliaryExam: {}, clinicalDiagnosis: {}, treatment: { treatments: [], medications: [] } };
const handbook = readFileSync(new URL('../docs/新增五例门诊实训参考答案.md', import.meta.url), 'utf8');
function diagnosisReference(name: string) {
  const section = handbook.split('## ' + name + '（')[1].split('\n## ')[0];
  const read = (label: string) => {
    const line = section.split('\n').find((value) => value.startsWith('**' + label + '**'));
    if (!line) throw new Error(name + '参考答案缺少' + label);
    return line.slice(label.length + 4).trim();
  };
  return { primary: read('西医主要诊断'), secondary: read('西医次要诊断'), tcm: read('中医诊断'), summary: read('诊断总结') };
}
function reference(patient: typeof cases[number]) {
  const requiredReports = patient.auxiliary.filter((item) => !('requiredForScore' in item) || item.requiredForScore !== false);
  return {
    messages: patient.history.map(({ question }) => ({ role: 'user', content: question })),
    physicalExam: { orderedIds: Object.keys(notes(patient.physical)), notes: notes(patient.physical), submittedNotes: {}, history: [] },
    fourDiagnosis: { ...notes(patient.four), 四诊总结: diagnosisReference(patient.name).tcm }, auxiliaryOrderedIds: Object.keys(notes(requiredReports)), auxiliaryExam: notes(requiredReports), clinicalDiagnosis: diagnosisReference(patient.name),
    treatment: { treatments: patient.treatment.map((item, index) => ({ id: 't' + index, category: '处置', item })), medications: [] },
  };
}

it.each(['next', 'express'] as const)('%s offers five distinct patients without exposing the grading key or the pulse answer', async (adapter) => {
  const response = adapter === 'next' ? listNext() : await fetch(base + '/api/training-cases');
  const publicData = (await response.json()).cases;
  expect(publicData.map((entry: { id: string }) => entry.id)).toEqual(cases.map(({ id }) => id));
  expect(new Set(cases.map(({ chiefComplaint }) => chiefComplaint)).size).toBe(5);
  for (const entry of publicData) {
    expect(Object.keys(entry).sort()).toEqual(['id', 'name', 'age', 'sex', 'chiefComplaint', 'opening', 'interviewQuestions', 'physical', 'four', 'auxiliary'].sort());
    for (const [field, moduleId] of [['physical', 'physicalExam'], ['auxiliary', 'auxiliaryExam']]) {
      const template = standard.modules.find((module) => module.id === moduleId)!;
      expect(entry[field].map((item: { id: string }) => item.id)).toEqual(template.criteria.map(({ id }) => id));
    }
    const pulse = entry.four.find((item: { readings?: unknown[] }) => item.readings);
    expect(pulse.result).toBe('');
    expect(pulse.readings).toHaveLength(3);
    expect(JSON.stringify(entry)).not.toMatch(/"keywords"|"pulseAnswer"|"pulseExplanation"|"diagnosisEvidence"|"diagnosisKeywords"|"requiredForScore"/);
  }
});

it.each(['next', 'express'] as const)('%s uses the selected case for interviews, pulse practice and treatment', async (adapter) => {
  for (const patient of cases) {
    const topic = patient.history[0];
    const reply = await post(adapter, 'chat', { caseId: patient.id, messages: [{ role: 'user', content: topic.question }], stream: true }, chatNext);
    const events = await reply.text();
    expect(events).toContain('event: delta');
    expect(events).toContain(topic.answer);
    const route = base + '/api/pulse-exam?caseId=' + patient.id;
    const clues = adapter === 'next' ? await cluesNext(new Request(route)) : await fetch(route);
    const pulse = patient.four.find((item) => item.readings);
    expect(await clues.json()).toMatchObject({ caseId: patient.id, positions: { index: pulse?.readings?.[0] } });
    const judged = await post(adapter, 'pulse-exam', { caseId: patient.id, selected: pulse?.pulseAnswer }, pulseNext);
    expect(await judged.json()).toMatchObject({ correct: true });
    const evaluated = await post(adapter, 'treatment-evaluation', { caseId: patient.id, diagnosis: {}, plan: reference(patient).treatment }, treatmentNext);
    expect(await evaluated.json()).toMatchObject({ status: 'passed', source: 'rules', teacherApproved: false });
  }
  expect((await post(adapter, 'chat', { caseId: 'missing', messages: [{ role: 'user', content: '哪里疼？' }] }, chatNext)).status).toBe(404);
});

it.each(['next', 'express'] as const)('%s grades each case from its own evidence and deducts missing or negated findings', async (adapter) => {
  for (const [i, patient] of cases.entries()) {
    const grade = async (snapshot: object) => (await post(adapter, 'case-assessment', { caseId: patient.id, snapshot }, assessNext)).json();
    const key = reference(patient);
    expect(await grade(empty)).toMatchObject({ caseId: patient.id, score: 0 });
    const perfect = await grade(key);
    expect(perfect.modules.flatMap((module: { checks: Array<{ score: number; maxScore: number }> }) => module.checks.filter((check) => check.score !== check.maxScore))).toEqual([]);
    expect(perfect).toMatchObject({ caseId: patient.id, score: 100, teacherApproved: false });
    expect((await grade({ ...key, fourDiagnosis: { ...key.fourDiagnosis, 四诊总结: '' } })).score).toBe(98);
    for (const [field, weight] of Object.entries({ primary: 8, secondary: 4, tcm: 4, summary: 4 })) {
      const result = await grade({ ...key, clinicalDiagnosis: { ...key.clinicalDiagnosis, [field]: '' } });
      expect(result.score).toBe(100 - weight);
    }
    expect((await grade(reference(cases[(i + 1) % cases.length]))).score).toBeLessThan(100);
    expect((await grade({ ...key, clinicalDiagnosis: { ...key.clinicalDiagnosis, primary: '不考虑' + key.clinicalDiagnosis.primary } })).score).toBe(92);
    expect((await grade({ ...key, clinicalDiagnosis: { primary: patient.diagnosis } })).score).toBe(80);
    expect((await grade({ ...key, clinicalDiagnosis: { primary: patient.diagnosisConflicts[0] } })).score).toBe(80);
    expect((await grade({ ...key, messages: key.messages.map((message) => ({ ...message, role: 'assistant' })) })).score).toBe(80);
  }
});
