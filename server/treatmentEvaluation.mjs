import treatmentPresets from '../shared/treatment-presets.json' with { type: 'json' };
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
  if (medications.some((row) => row.frequency !== undefined && !text(row.frequency))) return false;
  const hasContent = treatments.some((row) => row.item.trim()) || medications.some((row) => [row.name, row.route, row.dose, row.frequency ?? ''].some((part) => part.trim()));
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

const categoryAliases = [
  ['护理', '护理与观察'], ['饮食及营养', '饮食与营养', '饮食营养'],
  ['监测及支持', '监测与支持', '监测支持'], ['介入及手术', '介入与手术', '介入/手术', '介入手术'],
  ['中医治疗', '中医处置'], ['药物治疗', '药物处置', '用药'],
];
const caseText = (value) => value.normalize('NFKC').trim().replace(/\s/g, '').replace(/[。.!]+$/, '').toLowerCase();
const exactCaseMatch = (value, expected, aliases = []) => [expected, ...aliases].some((option) => caseText(value) === caseText(option));
const caseCategory = (value) => {
  const normalizedCategory = caseText(value);
  return categoryAliases.find((group) => group.includes(normalizedCategory))?.[0] ?? normalizedCategory;
};
const suppliedText = (value) => text(value) && Boolean(value.trim());
const validAliases = (value) => value === undefined || Array.isArray(value) && value.every(suppliedText);

function validCaseReference(submission, rubric) {
  if (rubric.caseId !== submission.caseId || !suppliedText(rubric.reference) || !Array.isArray(rubric.treatments) || !Array.isArray(rubric.medications)) return false;
  if (!rubric.treatments.length || !rubric.medications.length) return false;
  const points = [...rubric.treatments, ...rubric.medications];
  if (points.some((point) => !point || !suppliedText(point.id) || !suppliedText(point.reference)) || new Set(points.map((point) => point.id)).size !== points.length) return false;
  return rubric.treatments.every((point) => suppliedText(point.category) && suppliedText(point.item) && validAliases(point.aliases))
    && rubric.medications.every((point) => [point.name, point.route, point.dose].every(suppliedText)
      && validAliases(point.nameAliases) && validAliases(point.routeAliases)
      && (point.frequency === undefined || suppliedText(point.frequency))
      && (point.ingredients === undefined || Array.isArray(point.ingredients) && point.ingredients.length > 0
        && point.ingredients.every((ingredient) => ingredient && suppliedText(ingredient.name) && suppliedText(ingredient.amount))));
}

function treatmentParts(value, recognize) {
  return value.split(/[；;、\r\n]+/).flatMap((part) => {
    // A comma separates a list only if every part is an exact known item.
    const commaList = part.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
    return commaList.length > 1 && commaList.every(recognize) ? commaList : [part.trim()];
  }).filter(Boolean);
}

function negatedItem(value) {
  const key = caseText(value);
  return key.match(/^(?:不(?:执行|做|进行|予以|实施|采用|需要|考虑)?|无需|无须|取消|停止|避免)(.+)$/)?.[1]
    ?? key.match(/^(.+?)[,]?(?:但|暂|仍)?(?:不|未)(?:执行|开展|实施|进行|做)$/)?.[1];
}

const amountKey = (value) => value.normalize('NFKC').trim().toLowerCase().replace(/(\d)\s+(?=mg|g|毫克|克)/, '$1').replace(/毫克$/, 'mg').replace(/克$/, 'g');
const isPlainDose = (value) => /^(?:\d+(?:\.\d+)?|\.\d+)(?:mg|g)?$/.test(amountKey(value));

function decimalMassKey(value) {
  const match = /^(\d+(?:\.\d+)?|\.\d+)(mg|g)$/.exec(value);
  if (!match) return null;
  const [whole, fraction = ''] = match[1].split('.');
  const digits = (whole + fraction).replace(/^0+/, '');
  if (!digits) return '0';
  const significantDigits = digits.replace(/0+$/, '');
  const unitShift = match[2] === 'g' ? 3 : 0;
  // Preserve every decimal digit when comparing a quantity expressed in mg or g.
  const exponent = unitShift - fraction.length + digits.length - significantDigits.length;
  return significantDigits + ':' + exponent;
}

function sameDose(actual, expected) {
  const actualKey = amountKey(actual);
  const expectedKey = amountKey(expected);
  if (actualKey === expectedKey) return true;
  const expectedMass = decimalMassKey(expectedKey);
  return expectedMass !== null && expectedMass === decimalMassKey(actualKey);
}

function frequencyKey(value) {
  const key = caseText(value).replace(/\./g, '');
  const count = key.match(/^(?:每日|每天|一日)([一二两三四\d]+)次$|^([一二两三四\d]+)次\/日$/)?.slice(1).find(Boolean);
  const dailyCount = { qd: '1', bid: '2', tid: '3', qid: '4', 一: '1', 二: '2', 两: '2', 三: '3', 四: '4' };
  return count ? 'daily:' + (dailyCount[count] ?? count) : dailyCount[key] ? 'daily:' + dailyCount[key] : key;
}

function splitDoseFrequency(value) {
  const raw = value.normalize('NFKC').trim();
  const match = /(?:[bt]\.?i\.?d\.?|q\.?(?:d\.?|i\.?d\.?|o\.?d\.?)|q\d+h|(?:每日|每天|一日)\s*[一二两三四\d]+\s*次|[一二两三四\d]+\s*次\s*\/\s*日)\s*$/i.exec(raw);
  return match ? { dose: raw.slice(0, match.index).replace(/[\s,;、]+$/, ''), frequency: match[0] } : { dose: raw, frequency: '' };
}

function formulaParts(value) {
  const source = value.normalize('NFKC');
  const parts = [];
  let position = 0;
  const pattern = /([\p{Script=Han}]+(?:\([^()]+\))?)\s*(\d+(?:\.\d+)?(?:\s*(?:mg|g|毫克|克))?)(\s*\([^()]+\))?/gu;
  for (const match of source.matchAll(pattern)) {
    if (/[^\s,;、。]/.test(source.slice(position, match.index))) return null;
    parts.push({ name: match[1] + (match[3] ?? ''), amount: match[2] });
    position = match.index + match[0].length;
  }
  return /[^\s,;、。]/.test(source.slice(position)) ? null : parts;
}

function compareFormula(value, point) {
  if (value.normalize('NFKC').trim() === point.dose.normalize('NFKC').trim()) return null;
  const parts = formulaParts(value);
  if (!parts?.length) return { outcome: 'unreviewed', reason: '无法核对方药写法，请按原表逐味填写药名、数值和括号注记。' };
  const herbKey = (name) => caseText(name).replace(/\([^()]*\)/g, '');
  const expectedNames = new Set(point.ingredients.map((entry) => herbKey(entry.name)));
  const differences = [];
  for (const ingredient of point.ingredients) {
    const matches = parts.filter((part) => herbKey(part.name) === herbKey(ingredient.name));
    if (!matches.length) differences.push('缺少' + ingredient.name);
    else if (matches.length > 1) differences.push(ingredient.name + '重复列出');
    else {
      const [actual] = matches;
      if (caseText(actual.name) !== caseText(ingredient.name)) differences.push(ingredient.name + '的注记与原表不一致');
      if (amountKey(actual.amount) !== amountKey(ingredient.amount)) differences.push(ingredient.name + '的数值应按原表填写为' + ingredient.amount);
    }
  }
  if (differences.length) return { outcome: 'incorrect', reason: differences.join('；') + '。' };
  const extras = parts.filter((part) => !expectedNames.has(herbKey(part.name)));
  return extras.length ? { outcome: 'unreviewed', reason: '原表未列出' + extras.map((part) => part.name).join('、') + '，请核对。' } : null;
}

function checkCaseTreatments(rows, rubric, checks) {
  const attempted = new Set();
  const recognize = (item) => rubric.treatments.some((point) => exactCaseMatch(item, point.item, point.aliases));
  for (const [index, row] of rows.entries()) {
    for (const [partIndex, item] of treatmentParts(row.item, recognize).entries()) {
      const negated = negatedItem(item);
      const matches = rubric.treatments.filter((point) => exactCaseMatch(item, point.item, point.aliases) || negated && exactCaseMatch(negated, point.item, point.aliases));
      const point = matches.find((entry) => caseCategory(row.category) === caseCategory(entry.category)) ?? matches[0];
      const check = { id: 'case-treatment-' + index + '-' + partIndex, label: '处置第' + (index + 1) + '行 · ' + (point?.item ?? '项目待核对'), studentText: [row.category, item].filter(Boolean).join('；'), reference: point?.reference ?? rubric.reference };
      if (!point) checks.push({ ...check, outcome: 'unreviewed', reason: '这项表述未匹配原表中的项目，请核对。' });
      else {
        attempted.add(point.id);
        if (negated && !exactCaseMatch(item, point.item, point.aliases)) checks.push({ ...check, outcome: 'incorrect', reason: '此处表述否定了原表所列项目，请核对原表。' });
        else if (row.category.trim() && caseCategory(row.category) !== caseCategory(point.category)) checks.push({ ...check, outcome: 'incorrect', reason: '此项目在原表归入“' + point.category + '”，请修改处置类别。' });
        else if (row.category.trim()) checks.push({ ...check, outcome: 'met', reason: '处置类别与项目均和原表一致。' });
      }
    }
  }
  for (const point of rubric.treatments.filter((entry) => !attempted.has(entry.id))) {
    checks.push({ id: 'case-missing-' + point.id, label: point.category + ' · ' + point.item, outcome: 'missing', studentText: '', reason: '缺少原表列出的处置项目。', reference: point.reference });
  }
}

function checkCaseMedications(rows, rubric, checks) {
  const attempted = new Set();
  for (const [index, row] of rows.entries()) {
    if (![row.name, row.route, row.dose, row.frequency ?? ''].some((part) => part.trim())) continue;
    const point = rubric.medications.find((entry) => exactCaseMatch(row.name, entry.name, entry.nameAliases));
    const rowLabel = '用药第' + (index + 1) + '行 · ';
    const add = (key, label, studentText, outcome, reason) => {
      checks.push({ id: 'case-medication-' + index + '-' + key, label: rowLabel + label, outcome, studentText, reason, reference: point?.reference ?? rubric.reference });
    };
    if (!point) {
      if (row.name.trim()) add('name', '药物名称', row.name, 'unreviewed', '原表未列出此药名，请核对。');
      continue;
    }
    if (attempted.has(point.id)) add('duplicate', '重复用药', row.name, 'incorrect', '前面已有此项用药，请对照原表保留一行。');
    attempted.add(point.id);
    add('name', '药物名称', row.name, 'met', '药名与原表一致。');
    if (row.route.trim()) {
      const routeMatches = exactCaseMatch(row.route, point.route, point.routeAliases);
      add('route', '用药途径', row.route, routeMatches ? 'met' : 'incorrect', routeMatches ? '用药途径与原表一致。' : '原表用药途径为“' + point.route + '”。');
    }
    const { dose, frequency } = splitDoseFrequency(row.dose);
    const doseMatches = !point.ingredients && sameDose(dose, point.dose);
    const unparsedDose = dose && !point.ingredients && !doseMatches && !isPlainDose(dose);
    if (row.dose.trim()) {
      let difference = null;
      if (!dose) difference = { outcome: 'missing', reason: '已填写频次，请补充原表剂量。' };
      else if (point.ingredients) difference = compareFormula(dose, point);
      else if (unparsedDose) difference = { outcome: 'unreviewed', reason: '剂量栏含无法单独核对的内容，请按原表填写剂量和频次。' };
      else if (!doseMatches) difference = { outcome: 'incorrect', reason: '原表用药剂量为“' + point.dose + '”。' };
      add('dose', '用药剂量', unparsedDose ? row.dose.trim() : dose, difference?.outcome ?? 'met', difference?.reason ?? '用药剂量与原表一致。');
    }
    const frequencies = [frequency, row.frequency ?? ''].filter((value) => value.trim());
    if (point.frequency && (!unparsedDose || frequencies.length)) {
      const frequencyMatches = frequencies.length > 0 && frequencies.every((value) => frequencyKey(value) === frequencyKey(point.frequency));
      add('frequency', '用药频次', frequencies.join('；'), frequencyMatches ? 'met' : frequencies.length ? 'incorrect' : 'missing',
        frequencyMatches ? '用药频次与原表一致。' : '原表用药频次为“' + point.frequency + '”，请核对后填写。');
    } else if (!point.frequency && frequencies.length) add('frequency', '用药频次', frequencies.join('；'), 'unreviewed', '原表未单独注明此项频次，请核对。');
  }
  for (const point of rubric.medications.filter((entry) => !attempted.has(entry.id))) {
    checks.push({ id: 'case-missing-' + point.id, label: '用药 · ' + point.name, outcome: 'missing', studentText: '', reason: '缺少原表列出的用药项目。', reference: point.reference });
  }
}

function evaluateCaseReference(submission, rubric, checks) {
  const base = { source: 'rules', basis: 'case_reference', teacherApproved: false, rubricVersion: typeof rubric.version === 'string' ? rubric.version : 'unreviewed', checks };
  if (validCaseReference(submission, rubric)) {
    checkCaseTreatments(submission.plan.treatments, rubric, checks);
    checkCaseMedications(submission.plan.medications, rubric, checks);
  } else checks.push({ id: 'case-reference', label: '原始病例处置表', outcome: 'unreviewed', studentText: '', reason: '当前病例缺少可核对的完整处置表。', reference: '原始病例资料' });
  if (checks.some((check) => check.outcome === 'missing' || check.outcome === 'incorrect')) {
    return { ...base, status: 'needs_revision', message: '部分填写与原始病例处置表不一致或有缺漏，请按逐项反馈修订。' };
  }
  if (checks.some((check) => check.outcome === 'unreviewed')) return { ...base, status: 'pending_review', message: '部分内容需要与原始病例处置表进一步核对。' };
  return { ...base, status: 'passed', message: '填写内容已通过原始病例处置表复现练习。' };
}

export function evaluateTreatment(submission, rubric) {
  const checks = [];
  for (const [index, row] of submission.plan.treatments.entries()) {
    const unusedPreset = !row.item.trim() && treatmentPresets.some((preset) => preset.id === row.id && preset.category === row.category);
    if (unusedPreset || (!row.item.trim() && !row.category.trim())) continue;
    const missing = [['category', '处置类别'], ['item', '处置项目']].filter(([key]) => !row[key].trim()).map(([, label]) => label);
    if (missing.length) checks.push({ id: `treatment-fields-${index}`, label: `处置第${index + 1}行`, outcome: 'missing', studentText: row.item || row.category, reason: `未填写${missing.join('、')}，请补充后再提交。`, reference: '处置表填写要求' });
  }
  for (const [index, row] of submission.plan.medications.entries()) {
    if (![row.name, row.route, row.dose, row.frequency ?? ''].some((value) => value.trim())) continue;
    const missing = [['name', '药物名称'], ['route', '用药途径'], ['dose', '用药剂量']].filter(([key]) => !row[key].trim()).map(([, label]) => label);
    if (missing.length) checks.push({ id: `medication-fields-${index}`, label: `用药第${index + 1}行`, outcome: 'missing', studentText: [row.name, row.route, row.dose].join('；'), reason: `未填写${missing.join('、')}，请补充后再提交。`, reference: '处置表填写要求' });
  }
  if (rubric?.basis === 'case_reference') return evaluateCaseReference(submission, rubric, checks);
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
