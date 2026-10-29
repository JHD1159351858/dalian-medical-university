import { readFileSync } from 'node:fs';

const treatmentPresets = JSON.parse(readFileSync(new URL('../shared/treatment-presets.json', import.meta.url), 'utf8'));
const text = (value) => typeof value === 'string' && value.length <= 4_000;
const normalized = (value) => value.trim().replace(/[\s，,。；;：:]/g, '').toLowerCase();

export function validTreatmentSubmission(value) {
  if (!value || value.caseId !== 'wang-xu' || !value.plan || !value.diagnosis || typeof value.diagnosis !== 'object' || Array.isArray(value.diagnosis)) return false;
  const { treatments, medications } = value.plan;
  if (![treatments, medications].every((rows) => Array.isArray(rows) && rows.length <= 30)) return false;
  if (Object.keys(value.diagnosis).length > 10 || !Object.values(value.diagnosis).every(text)) return false;
  for (const [rows, fields] of [[treatments, ['category', 'item']], [medications, ['name', 'route', 'dose']]]) {
    if (new Set(rows.map((row) => row?.id)).size !== rows.length) return false;
    if (!rows.every((row) => row && typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 100 && fields.every((key) => text(row[key])))) return false;
  }
  const hasContent = treatments.some((row) => row.item.trim()) || medications.some((row) => [row.name, row.route, row.dose].some((part) => part.trim()));
  return Boolean(hasContent && JSON.stringify(value).length <= 30_000);
}

function entriesFor(submission) {
  return [
    ...submission.plan.treatments.filter((row) => row.item.trim()).map((row) => ({ target: 'treatment', text: row.item.trim() })),
    ...submission.plan.medications.filter((row) => [row.name, row.route, row.dose].some((part) => part.trim())).map((row) => ({ target: 'medication', text: [row.name, row.route, row.dose].map((part) => part.trim()).join('；') })),
    ...Object.values(submission.diagnosis).filter((value) => value.trim()).map((value) => ({ target: 'diagnosis', text: value.trim() })),
  ];
}

function usableRule(rule) {
  return rule && ['treatment', 'medication', 'diagnosis'].includes(rule.target) && ['id', 'label', 'reason', 'reference'].every((key) => typeof rule[key] === 'string' && rule[key].trim()) && Array.isArray(rule.accepted) && rule.accepted.length > 0 && rule.accepted.every((value) => text(value) && normalized(value));
}

const matches = (entry, rule) => entry.target === rule.target && rule.accepted.some((value) => normalized(entry.text) === normalized(value));

export function evaluateTreatment(submission, rubric) {
  const checks = [];
  for (const [index, row] of submission.plan.treatments.entries()) {
    const unusedPreset = !row.item.trim() && treatmentPresets.some((preset) => preset.id === row.id && preset.category === row.category);
    if (unusedPreset || (!row.item.trim() && !row.category.trim())) continue;
    const missing = [['category', '处置类别'], ['item', '处置项目']].filter(([key]) => !row[key].trim()).map(([, label]) => label);
    if (missing.length) checks.push({ id: `treatment-fields-${index}`, label: `处置第${index + 1}行`, outcome: 'missing', studentText: row.item || row.category, reason: `未填写${missing.join('、')}，请补充后再提交。`, reference: '处置表填写要求' });
  }
  for (const [index, row] of submission.plan.medications.entries()) {
    if (![row.name, row.route, row.dose].some((value) => value.trim())) continue;
    const missing = [['name', '药物名称'], ['route', '用药途径'], ['dose', '用药剂量']].filter(([key]) => !row[key].trim()).map(([, label]) => label);
    if (missing.length) checks.push({ id: `medication-fields-${index}`, label: `用药第${index + 1}行`, outcome: 'missing', studentText: [row.name, row.route, row.dose].join('；'), reason: `未填写${missing.join('、')}，请补充后再提交。`, reference: '处置表填写要求' });
  }
  const approved = Boolean(rubric && rubric.caseId === submission.caseId && rubric.approved === true && rubric.approvedBy?.trim() && rubric.reference?.trim() && Array.isArray(rubric.required) && rubric.required.length && rubric.required.every(usableRule) && Array.isArray(rubric.forbidden) && rubric.forbidden.every(usableRule) && Array.isArray(rubric.allowed) && rubric.allowed.every(usableRule));
  const base = { source: 'rules', teacherApproved: approved, rubricVersion: typeof rubric?.version === 'string' ? rubric.version : 'unreviewed', checks };
  if (!approved) {
    checks.push({ id: 'teacher-standard', label: '本病例处置标准', outcome: 'unreviewed', studentText: '', reason: '尚未提供教师审核的标准处置、可接受方案与错误依据，当前无法判断临床处置正误。', reference: '三份修改材料未提供本病例处置标准答案' });
    const incomplete = checks.some((check) => check.outcome === 'missing');
    return { ...base, status: incomplete ? 'needs_revision' : 'pending_review', message: incomplete ? '填写信息不完整，请补充后重新提交；临床处置正确性仍待教师确认。' : '已检查填写内容，处置正确性待教师确认。' };
  }
  const entries = entriesFor(submission);
  for (const rule of rubric.required) {
    const found = entries.find((entry) => matches(entry, rule));
    checks.push({ id: rule.id, label: rule.label, outcome: found ? 'met' : 'missing', studentText: found?.text || '', reason: found ? '符合已审核标准中的可接受表述。' : rule.reason, reference: rule.reference });
  }
  for (const rule of rubric.forbidden) {
    const found = entries.find((entry) => matches(entry, rule));
    if (found) checks.push({ id: rule.id, label: rule.label, outcome: 'incorrect', studentText: found.text, reason: rule.reason, reference: rule.reference });
  }
  const knownRules = [...rubric.required, ...rubric.forbidden, ...rubric.allowed];
  entries.filter((entry) => !knownRules.some((rule) => matches(entry, rule))).forEach((entry, index) => checks.push({ id: `uncovered-${index}`, label: entry.target === 'diagnosis' ? '诊断表述待核对' : '方案表述待核对', outcome: 'unreviewed', studentText: entry.text, reason: '当前标准未覆盖这条完整表述，需要教师核对，不能仅凭关键词判断正确。', reference: rubric.reference }));
  if (rubric.exhaustive !== true) checks.push({ id: 'coverage', label: '标准覆盖范围', outcome: 'unreviewed', studentText: '', reason: '教师尚未确认此标准覆盖完整方案。', reference: rubric.reference });
  const status = checks.some((check) => ['missing', 'incorrect'].includes(check.outcome)) ? 'needs_revision' : checks.some((check) => check.outcome === 'unreviewed') ? 'pending_review' : 'passed';
  return { ...base, status, message: status === 'passed' ? '方案符合本病例已审核的处置标准。' : status === 'needs_revision' ? '发现需要修改或补充的项目，请按逐项反馈修订。' : '已有表述需要教师进一步核对，尚不能判定通过。' };
}

export function validEvaluationAdvice(advice, checks) {
  if (!advice || typeof advice !== 'object' || Object.keys(advice).some((key) => key !== 'notes') || !Array.isArray(advice.notes) || !advice.notes.length || advice.notes.length > 30) return false;
  return advice.notes.every((note) => {
    if (!note || Object.keys(note).some((key) => !['checkId', 'studentQuote', 'referenceQuote'].includes(key)) || typeof note.studentQuote !== 'string' || note.studentQuote.length > 1000 || typeof note.referenceQuote !== 'string' || !note.referenceQuote.trim() || note.referenceQuote.length > 1000) return false;
    const check = checks.find((item) => item.id === note.checkId);
    return Boolean(check && check.studentText.includes(note.studentQuote) && (check.reference.includes(note.referenceQuote) || check.reason.includes(note.referenceQuote)));
  });
}
