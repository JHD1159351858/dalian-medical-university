import pulseCases from './pulse-cases.json' with { type: 'json' };
import { findTrainingCase } from './trainingCases.mjs';

/** @typedef {{ label: string, light: string, deep: string }} PulsePosition */
/** @typedef {{ positions: { index: PulsePosition, middle: PulsePosition, ring: PulsePosition }, standardAnswer: string[], explanation: Record<string, string> }} PulseCase */

/** @param {unknown} caseId
 * @returns {PulseCase | null} */
function findCase(caseId) {
  if (typeof caseId !== 'string') return null;
  if (Object.hasOwn(pulseCases.cases, caseId)) return pulseCases.cases[caseId];
  const pulse = findTrainingCase(caseId)?.four.find((item) => item.readings);
  if (!pulse?.readings || !pulse.pulseAnswer || !pulse.pulseExplanation) return null;
  const [index, middle, ring] = pulse.readings;
  return { positions: { index: { label: '寸', ...index }, middle: { label: '关', ...middle }, ring: { label: '尺', ...ring } }, standardAnswer: pulse.pulseAnswer, explanation: pulse.pulseExplanation };
}

const optionsFor = (caseId) => caseId === 'wang-xu' ? pulseCases.options : [...pulseCases.options, '平'];

const missingCase = () => ({ status: 404, body: { error: '未找到该病例的脉诊练习。' } });

/** @param {unknown} caseId */
export function getPulseExam(caseId) {
  const patientCase = findCase(caseId);
  if (!patientCase) return missingCase();
  return { status: 200, body: { caseId, positions: patientCase.positions, options: optionsFor(caseId) } };
}

/** @param {unknown} caseId
 * @param {unknown} selected */
export function submitPulseExam(caseId, selected) {
  const patientCase = findCase(caseId);
  if (!patientCase) return missingCase();
  if (!Array.isArray(selected) || !selected.length || !selected.every((value) => typeof value === 'string' && optionsFor(caseId).includes(value))) {
    return { status: 400, body: { error: '请至少选择一种有效脉象。' } };
  }
  const studentAnswer = /** @type {string[]} */ ([...new Set(selected)]);
  const standardAnswer = patientCase.standardAnswer;
  const missed = standardAnswer.filter((value) => !studentAnswer.includes(value));
  const extra = studentAnswer.filter((value) => !standardAnswer.includes(value));
  return {
    status: 200,
    body: { correct: !missed.length && !extra.length, standardAnswer, studentAnswer, missed, extra, explanation: patientCase.explanation },
  };
}
