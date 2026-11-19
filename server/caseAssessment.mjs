import standard from './case-standard.json' with { type: 'json' };
import treatmentRubric from './treatment-rubric.json' with { type: 'json' };
import { evaluateTreatment } from './treatmentEvaluation.mjs';
import { findTrainingCase, matchesReference, treatmentReferenceChecks } from './trainingCases.mjs';

/** @param {unknown} value
 * @returns {value is Record<string, unknown>} */
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const text = (value) => typeof value === 'string' && value.length <= 20_000;
const textMap = (value) => object(value) && Object.values(value).every(text);
const normalize = (value) => value.normalize('NFKC').toLowerCase().replace(/[\s，,。；;、：:（）()！？!?]/g, '');

function validSnapshot(snapshot) {
  if (!object(snapshot) || !Array.isArray(snapshot.messages) || snapshot.messages.length > 1000 || !snapshot.messages.every((message) => object(message) && ['user', 'assistant'].includes(message.role) && text(message.content))) return false;
  if (!textMap(snapshot.fourDiagnosis) || !textMap(snapshot.auxiliaryExam) || !textMap(snapshot.clinicalDiagnosis) || !object(snapshot.treatment)) return false;
  for (const [name, fields] of [['treatments', ['id', 'category', 'item']], ['medications', ['id', 'name', 'route', 'dose']]]) {
    const rows = snapshot.treatment[name];
    if (!Array.isArray(rows) || rows.length > 30 || !rows.every((row) => object(row) && fields.every((key) => text(row[key])) && (row.frequency === undefined || text(row.frequency)))) return false;
  }
  const exam = snapshot.physicalExam;
  return exam === null || object(exam) && textMap(exam.notes) && textMap(exam.submittedNotes) && Array.isArray(exam.orderedIds) && Array.isArray(exam.history);
}

function fieldText(snapshot, path) {
  if (path === 'messages.user') return snapshot.messages.filter((message) => message.role === 'user').map((message) => message.content).join('\n');
  const parts = path.split('.');
  if (parts[0] === 'physicalExam') return snapshot.physicalExam?.notes?.[parts[2]] ?? snapshot.physicalExam?.submittedNotes?.[parts[2]] ?? '';
  return snapshot[parts[0]]?.[parts[1]] ?? '';
}

function occurrences(actual, phrase) {
  const expected = normalize(phrase);
  let positive = false;
  let negative = false;
  let start = 0;
  while (expected && (start = actual.indexOf(expected, start)) !== -1) {
    const before = actual.slice(Math.max(0, start - 18), start);
    const after = actual.slice(start + expected.length, start + expected.length + 12);
    const negated = /(?:无|未见|没有|否认|不是|并非|不考虑|不支持|不符合|排除|不)(?:明显|存在|出现|发生|诊断|提示|符合|为|是|有|的|季节性|急性|单纯性|左|右){0,5}$/.test(before)
      || /^(?:不成立|未证实|已排除|不支持)/.test(after);
    if (negated) negative = true;
    else positive = true;
    start += expected.length;
  }
  return { positive, negative };
}

function scoreCriterion(snapshot, criterion) {
  const actual = normalize(fieldText(snapshot, criterion.path));
  const missing = criterion.groups.filter((group) => !group.some((phrase) => {
    if (criterion.mode === 'question') return actual.includes(normalize(phrase));
    const match = occurrences(actual, phrase);
    return match.positive && !match.negative;
  }));
  const conflicts = (criterion.forbidden ?? []).filter((phrase) => occurrences(actual, phrase).positive);
  const met = !missing.length && !conflicts.length;
  return {
    id: criterion.id, label: criterion.label, score: met ? criterion.maxScore : 0, maxScore: criterion.maxScore,
    feedback: met ? '已覆盖本病例参考要点。' : conflicts.length ? '出现与本病例参考相矛盾的表述：' + conflicts.join('、') + '。'
      : '未覆盖或否定了本病例参考要点：' + missing.map((group) => group[0]).join('、') + '。',
  };
}

function treatmentChecks(snapshot, maxScore) {
  const result = evaluateTreatment({ caseId: standard.caseId, diagnosis: snapshot.clinicalDiagnosis, plan: snapshot.treatment }, treatmentRubric);
  const met = result.checks.filter((check) => check.outcome === 'met').length;
  const score = result.status === 'passed' ? maxScore : Math.min(maxScore - 0.01, Math.round(maxScore * met / Math.max(1, result.checks.length) * 100) / 100);
  return [{
    id: 'case-treatment-reference', label: '原病例处置及用药核对', score, maxScore,
    feedback: result.status === 'passed' ? '处置、用药途径、剂量和原表已注明频次均通过原病例核对。'
      : result.checks.filter((check) => check.outcome !== 'met').slice(0, 4).map((check) => check.label + '：' + check.reason).join('；'),
  }];
}

function trainingModules(patient, snapshot) {
  const questions = snapshot.messages.filter((message) => message.role === 'user').map((message) => normalize(message.content));
  const findings = (items, notes) => items.map((item) => ({
    id: item.id, label: item.label, met: matchesReference(notes?.[item.id] ?? notes?.[item.label] ?? '', item.keywords), expected: item.result,
  }));
  const evidence = {
    diagnosis: patient.history.map((topic) => ({
      label: topic.label, met: questions.some((question) => topic.keywords.some((word) => question.includes(normalize(word)))), expected: topic.question,
    })),
    physicalExam: findings(patient.physical, { ...snapshot.physicalExam?.submittedNotes, ...snapshot.physicalExam?.notes }),
    auxiliaryExam: findings(patient.auxiliary.filter((item) => item.requiredForScore !== false), snapshot.auxiliaryExam),
    treatment: treatmentReferenceChecks(patient, snapshot.treatment).map((check) => ({ label: check.label, met: check.outcome === 'met', expected: check.reference })),
  };
  return standard.modules.map(({ id, label, maxScore, criteria }) => {
    if (id === 'clinicalDiagnosis' || id === 'fourDiagnosis') {
      const checks = criteria.map(({ id: field, path, maxScore: points }) => {
        if (id === 'fourDiagnosis') {
          const fieldLabel = { look: '望诊', listen: '闻诊', ask: '问诊', feel: '切诊', summary: '四诊总结' }[field];
          const groups = field === 'summary' ? patient.diagnosisEvidence.tcm
            : [patient.four.find((item) => item.label === fieldLabel).keywords];
          return scoreCriterion(snapshot, { id: field, label: fieldLabel, path: 'fourDiagnosis.' + fieldLabel, maxScore: points, groups });
        }
        const includesDiagnosis = field === 'primary' || field === 'summary';
        const groups = patient.diagnosisEvidence[field];
        return scoreCriterion(snapshot, {
          id: field, path, maxScore: points,
          label: { primary: '西医主要诊断及依据', secondary: '西医次要诊断及依据', tcm: '中医四诊辨证依据', summary: '诊断总结与依据' }[field],
          groups: includesDiagnosis ? [patient.diagnosisKeywords, ...groups] : groups,
          forbidden: includesDiagnosis ? patient.diagnosisConflicts : [],
        });
      });
      return { id, label, maxScore, checks, score: checks.reduce((sum, check) => sum + check.score, 0) };
    }
    const points = evidence[id];
    const checks = points.map((point, index) => {
      const weight = (id === 'physicalExam' && criteria.find((criterion) => criterion.id === point.id)?.maxScore)
        || Math.floor(maxScore * (index + 1) / points.length) - Math.floor(maxScore * index / points.length);
      return { id: point.id ?? id + '-' + index, label: point.label, maxScore: weight, score: point.met ? weight : 0,
        feedback: point.met ? '已覆盖本病例参考要点。' : '可对照本病例参考内容：' + point.expected };
    });
    return { id, label, score: checks.reduce((sum, check) => sum + check.score, 0), maxScore, checks };
  });
}

/** @param {unknown} submission */
export function assessCase(submission) {
  if (!object(submission) || typeof submission.caseId !== 'string') return { status: 400, body: { error: '病例评分请求格式无效。' } };
  const trainingCase = findTrainingCase(submission.caseId);
  if (submission.caseId !== standard.caseId && !trainingCase) return { status: 404, body: { error: '未找到该病例的参考评分标准。' } };
  if (Buffer.byteLength(JSON.stringify(submission), 'utf8') > 512 * 1024 || !validSnapshot(submission.snapshot)) return { status: 400, body: { error: '病例记录格式无效或超过512KB。' } };
  const snapshot = submission.snapshot;
  const modules = trainingCase ? trainingModules(trainingCase, snapshot) : standard.modules.map((module) => {
    const checks = module.id === 'treatment' ? treatmentChecks(snapshot, module.maxScore) : module.criteria.map((criterion) => scoreCriterion(snapshot, criterion));
    return { id: module.id, label: module.label, score: Math.round(checks.reduce((sum, check) => sum + check.score, 0) * 100) / 100, maxScore: module.maxScore, checks };
  });
  return {
    status: 200,
    body: { caseId: submission.caseId, version: trainingCase ? 'abdominal-cases-2026-11-v1' : standard.version, source: 'case_reference', teacherApproved: false,
      score: Math.round(modules.reduce((sum, module) => sum + module.score, 0) * 100) / 100, maxScore: 100, modules,
      scopeNote: trainingCase ? '按本次模拟患者的六个训练环节核对问诊和书面记录中的参考要点。' : standard.scopeNote },
  };
}
