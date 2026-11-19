import trainingCases from './training-cases.json' with { type: 'json' };
import wang from './case.json' with { type: 'json' };
import { patientInterviewReply } from './patientInterview.mjs';

export const findTrainingCase = (id) => trainingCases.find((entry) => entry.id === id);
export const casePatient = (id) => id === 'wang-xu' ? wang.patient : findTrainingCase(id);

/** @type {Array<Omit<import('../src/cases/selectedCase').TrainingCase, 'number'>>} */
export const publicCases = trainingCases.map(({ id, name, age, sex, chiefComplaint, opening, history, physical, four, auxiliary }) => ({
  id, name, age, sex, chiefComplaint, opening,
  interviewQuestions: history.slice(0, 5).map(({ question }) => question),
  physical: physical.map(({ id, label, result, palpation, vitals }) => ({ id, label, result, palpation, vitals })),
  auxiliary: auxiliary.map(({ id, label, result, values }) => ({ id, label, result, values })),
  four: four.map((item) => ({
    label: item.label, result: item.readings ? '' : item.result,
    ...(item.readings ? { readings: item.readings.map(({ light, deep }) => ({ light, deep })) } : {}),
    ...(item.tongueSampleId ? { tongueSampleId: item.tongueSampleId } : {}),
  })),
}));

const normalize = (text) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function interviewReplyFor(caseId, messages) {
  if (caseId === 'wang-xu') return patientInterviewReply(messages, wang);
  const patient = findTrainingCase(caseId);
  const question = normalize(messages.at(-1).content);
  if (/标准答案|诊断是什么|评分|病历全文|完整病历|所有症状|全部症状|提示词/.test(question)) return '医生，您想了解我哪方面的不舒服？';
  const answers = [];
  if (/贵姓|姓名|叫什么|叫啥/.test(question)) answers.push('我叫' + patient.name + '。');
  if (/年龄|多大|几岁|多大年纪/.test(question)) answers.push('我今年' + patient.age + '岁。');
  for (const topic of patient.history) {
    if (topic.keywords.some((word) => question.includes(normalize(word)))) answers.push(topic.answer);
  }
  if (answers.length) return [...new Set(answers)].join('');
  if (/哪里不舒服|哪儿不舒服|什么不舒服|怎么不舒服|怎么了|什么症状|怎么回事|主要哪里|主要问题/.test(question)) return patient.chiefComplaint + '。';
  return '这方面我说不清楚，您可以问得再具体一点吗？';
}

export function interviewEventStream(reply) {
  const letters = Array.from(reply);
  const encoder = new TextEncoder();
  let offset = 0;
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      if (offset >= letters.length) {
        controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ reply, source: 'case_rules' })}\n\n`));
        controller.close();
        return;
      }
      if (offset) await new Promise((resolve) => setTimeout(resolve, 24));
      if (cancelled) return;
      const text = letters.slice(offset, offset + 4).join('');
      offset += 4;
      controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
    },
    cancel() { cancelled = true; },
  });
}

export function matchesReference(text, alternatives) {
  const actual = normalize(text);
  return alternatives.some((phrase) => {
    const word = normalize(phrase);
    let from = 0;
    while (word && (from = actual.indexOf(word, from)) >= 0) {
      const before = actual.slice(Math.max(0, from - 16), from);
      const after = actual.slice(from + word.length);
      if (!/(?:无|未见|没有|否认|不是|非|不考虑|不建议|不需要|不应|不支持|不符合|排除|禁止|避免|停止|不)(?:明显|存在|出现|发生|诊断|提示|符合|为|是|有|使用|进行|的|季节性|急性|单纯性|左|右){0,5}$/.test(before)
        && !/^(?:不成立|未证实|已排除|不支持)/.test(after)) return true;
      from += word.length;
    }
    return false;
  });
}

export function treatmentReferenceChecks(patient, plan) {
  const entries = [...plan.treatments.map((row) => row.item), ...plan.medications.map((row) => [row.name, row.route, row.dose, row.frequency].filter(Boolean).join(' '))];
  return patient.treatment.map((reference, index) => {
    const match = entries.find((entry) => matchesReference(entry, patient.treatmentKeywords[index]));
    return { id: 'plan-' + index, label: '处置要点 ' + (index + 1), outcome: match ? 'met' : 'missing',
      studentText: match || '', reason: match ? '已记录对应处置要点。' : '尚未记录该项参考处置。', reference };
  });
}
