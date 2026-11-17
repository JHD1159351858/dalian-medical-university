import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import standard from '../server/case-standard.json';

it('keeps the six module weights at 100 and the reference source unapproved', async () => {
  const { assessCase } = await import('../server/caseAssessment.mjs');
  expect(standard.modules.map((module) => module.maxScore)).toEqual([20, 15, 15, 10, 20, 20]);
  expect(standard.teacherApproved).toBe(false);
  const result = assessCase(standard.referenceSubmission);
  expect(result).toMatchObject({ status: 200, body: { score: 100, maxScore: 100, teacherApproved: false } });
});

it('also gives the readable six-category treatment answer 100', async () => {
  const { assessCase } = await import('../server/caseAssessment.mjs');
  const value = structuredClone(standard.referenceSubmission);
  const groups = new Map<string, string[]>();
  for (const row of value.snapshot.treatment.treatments) groups.set(row.category, [...(groups.get(row.category) ?? []), row.item]);
  value.snapshot.treatment.treatments = [...groups].map(([category, items], index) => ({ id: 'group-' + index, category, item: items.join('；') }));
  expect(assessCase(value)).toMatchObject({ status: 200, body: { score: 100 } });
});

it('scores the revised thin white coating without requiring the previous red and yellow tongue findings', async () => {
  const { assessCase } = await import('../server/caseAssessment.mjs');
  const value = structuredClone(standard.referenceSubmission);
  value.snapshot.fourDiagnosis.look = '舌质淡红，苔薄白，皮肤和巩膜无黄染。';
  value.snapshot.clinicalDiagnosis.tcm = '原病例中医诊断：脾心痛，湿热毒蕴。当前训练舌象为薄白苔，脉沉滑数；证型沿用原病例记录。';
  expect(assessCase(value)).toMatchObject({ status: 200, body: { score: 100 } });
});

it.each(['黄腻苔', '苔黄燥腻', '薄白苔，同时有黄腻苔'])('deducts the outdated or conflicting tongue finding %s', async (tongue) => {
  const { assessCase } = await import('../server/caseAssessment.mjs');
  const value = structuredClone(standard.referenceSubmission);
  value.snapshot.fourDiagnosis.look = `舌质淡红，${tongue}，皮肤和巩膜无黄染。`;
  const result = assessCase(value);
  expect(result.body.score).toBeLessThan(100);
  expect(result.body.modules?.find((module: { id: string }) => module.id === 'fourDiagnosis')?.score).toBeLessThan(15);
});

it('deducts a missing tongue observation while retaining full marks for a negated old finding', async () => {
  const { assessCase } = await import('../server/caseAssessment.mjs');
  const value = structuredClone(standard.referenceSubmission);
  value.snapshot.fourDiagnosis.look = '皮肤和巩膜无黄染。';
  expect(assessCase(value).body.score).toBeLessThan(100);
  value.snapshot.fourDiagnosis.look = '舌质淡红，薄白苔，无黄腻苔。皮肤和巩膜无黄染。';
  expect(assessCase(value).body.score).toBe(100);
});

it('gives the complete answer reconstructed from the readable document 100', async () => {
  const { assessCase } = await import('../server/caseAssessment.mjs');
  const document = readFileSync('docs/王旭案例标准答案.md', 'utf8');
  const section = (start: string, end: string) => {
    const content = document.split(start)[1]?.split(end)[0];
    if (!content) throw new Error(`Missing answer section: ${start}`);
    return content;
  };
  const textBlocks = (content: string) => [...content.matchAll(/```text\r?\n([\s\S]*?)\r?\n```/g)].map((match) => match[1].trim());
  const tableRows = (content: string) => content.split(/\r?\n/).filter((line) => line.startsWith('|')).slice(2).map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
  const value = structuredClone(standard.referenceSubmission);
  const interview = section('## 一、问诊', '## 二、体格检查');
  const questions = tableRows(interview);
  expect(questions).toHaveLength(15);
  value.snapshot.messages = questions.flatMap(([, question, answer]) => [{ role: 'user', content: question }, { role: 'assistant', content: answer }]);
  const examAnswers = textBlocks(section('## 二、体格检查', '## 三、中医四诊'));
  const examIds = Object.keys(value.snapshot.physicalExam.notes);
  expect(examAnswers).toHaveLength(examIds.length);
  const examNotes = Object.fromEntries(examIds.map((id, index) => [id, examAnswers[index]]));
  Object.assign(value.snapshot.physicalExam.notes, examNotes);
  Object.assign(value.snapshot.physicalExam.submittedNotes, examNotes);
  const [look, listen, ask, feel, summary] = textBlocks(section('## 三、中医四诊', '## 四、辅助检查'));
  value.snapshot.fourDiagnosis = { look, listen, ask, feel, summary };
  const auxiliaryAnswers = textBlocks(section('## 四、辅助检查', '## 五、诊断'));
  const auxiliaryIds = Object.keys(value.snapshot.auxiliaryExam);
  expect(auxiliaryAnswers).toHaveLength(auxiliaryIds.length);
  Object.assign(value.snapshot.auxiliaryExam, Object.fromEntries(auxiliaryIds.map((id, index) => [id, auxiliaryAnswers[index]])));
  const [primary, secondary, tcm, diagnosisSummary] = textBlocks(section('## 五、诊断', '## 六、处置与用药'));
  value.snapshot.clinicalDiagnosis = { primary, secondary, tcm, summary: diagnosisSummary };
  const treatmentRows = tableRows(section('### 处置清单：六行', '### 用药清单：五行'));
  expect(treatmentRows).toHaveLength(6);
  value.snapshot.treatment.treatments = treatmentRows.map(([category, item], index) => ({ id: `document-treatment-${index}`, category, item }));
  const medicationSection = section('### 用药清单：五行', '## 已变更症状与资料边界');
  const medicationRows = tableRows(medicationSection);
  expect(medicationRows).toHaveLength(5);
  const [herbs] = textBlocks(medicationSection);
  value.snapshot.treatment.medications = medicationRows.map(([name, route, dose], index) => ({ id: `document-medication-${index}`, name, route, dose: name === '中药' ? herbs : dose }));
  expect(value.snapshot.fourDiagnosis.look).toContain('苔薄白');
  expect(assessCase(value)).toMatchObject({ status: 200, body: { score: 100, maxScore: 100, teacherApproved: false } });
});
