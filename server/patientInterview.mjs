const refusal = '请针对患者的不适逐项提问，我会回答您正在询问的情况。';
const clarifyTime = '您想了解哪项症状的时间？请针对腹痛、进食或排便等具体情况追问。';
const unmatchedPart = '其余所问内容当前资料未确认，请针对具体情况继续追问。';
const durationPattern = /多久|多长时间|几天|何时|什么时候|哪天|病程|起病|发病|昨[天晚]|(?:疼|痛)了/;
const painTopics = ['location', 'character', 'pressureTrigger', 'radiation'];

const topics = [
  ['location', /哪(?:里|儿|个部位|一部位).*?(?:疼|痛|不舒服)|(?:疼|痛).*?哪(?:里|儿)|部位|什么地方/],
  ['character', /性质|什么样.*?(?:疼|痛)|(?:疼|痛).*?(?:什么样|什么感觉|怎样的感觉)|胀痛|刺痛|隐痛|绞痛|钝痛|灼痛|怎么(?:疼|痛)/],
  ['foodTrigger', /油腻|饭[前后]|(?:进食|吃饭|吃东西|吃食物).*?(?:加重|疼|痛|关系|影响|有关|相关)|(?:疼|痛).*?(?:进食|吃饭|饮食)|饮食.*?(?:关系|影响|加重|有关|相关)/],
  ['pressureTrigger', /按压|按(?:着|住|下|上去|一下|肚子|腹部)|触碰|碰.*?(?:疼|痛)/],
  ['coldHeat', /怕冷|怕热|畏寒|恶寒|寒热|发热|发烧|冷热|冷不冷|热不热|烧吗/],
  ['sweating', /汗/],
  ['appetite', /胃口|食欲|能.*?(?:吃|进食)|吃不下|吃得下|进食(?:情况|怎么样|如何)|饮食(?:情况|怎么样|如何)|平时.*?(?:吃|饮食)/],
  ['thirst', /口干|口渴|渴不渴|嘴干|想.*?喝水|喝水/],
  ['bowel', /大便|排便|便秘|二便/],
  ['sleep', /睡|失眠/],
  ['temperature', /体温|多少度/],
  ['radiation', /放射|牵扯|串到/],
  ['abdominalDistension', /腹胀|肚子胀/],
  ['nausea', /恶心|反胃/], ['vomiting', /呕吐|吐过|吐了|想吐/],
  ['diarrhea', /腹泻|拉肚子/], ['bloodyStool', /便血|血便|大便.*?血/],
  ['chestTightness', /胸闷|胸口闷/], ['chestPain', /胸痛|胸口疼|胸口痛/],
  ['cough', /咳嗽|咳痰/],
];

const unconfirmedTopics = [
  ['tongue', /舌/], ['pulse', /脉象|把脉|脉搏|脉诊/], ['smell', /口臭|气味|异味/],
  ['urination', /小便|排尿|尿(?:量|色|频|痛|急)|二便/], ['appearance', /巩膜|眼白|黄染|面色|脸色|皮肤/],
  ['voice', /声音.*?(?:洪亮|低沉)|语声/], ['breathing', /呼吸|喘|气短/],
];

function durationFromContext(messages, caseData) {
  const previous = messages.slice(0, -1);
  const context = (previous.findLast((message) => message.role === 'user') ?? previous.at(-1))?.content ?? '';
  const matched = [...topics, ...unconfirmedTopics].filter(([, pattern]) => pattern.test(context)).map(([topic]) => topic);
  if (matched.length && matched.every((topic) => painTopics.includes(topic))) return caseData.interviewFacts.duration;
  if (matched.length === 1) {
    const topic = matched[0];
    if (['bowel', 'appetite', 'foodTrigger'].includes(topic)) return caseData.interviewFacts[topic];
    if (caseData.pendingTeacherConfirmation[topic]) return caseData.pendingTeacherConfirmation[topic];
  }
  if (!matched.length && /疼|痛|病程|起病|发病/.test(context)) return caseData.interviewFacts.duration;
  return clarifyTime;
}

export function patientInterviewReply(messages, caseData) {
  const latest = messages.at(-1);
  if (latest?.role !== 'user') return null;
  const question = latest.content.replace(/\s+/g, '').toLowerCase();
  if (/提示词|系统(?:消息|指令|规则)|case_data|chiefcomplaint|(?:全部|完整|所有).{0,5}(?:病历|病例|症状|资料)|(?:病历|病例).{0,5}(?:全部|完整|json)|(?:忽略|无视).{0,8}(?:规则|要求|指令)/.test(question)) return refusal;

  const replies = [];
  const facts = caseData.interviewFacts;
  let hasUnmatchedPart = false;
  const clauses = question.split(/[，,、；;。？！?!]|(?:还有|另外|以及|并且|或者|还是|和|及|或)/).filter(Boolean);
  for (const clause of clauses) {
    const matchingFacts = topics.filter(([, pattern]) => pattern.test(clause));
    const matchingPending = unconfirmedTopics.filter(([, pattern]) => pattern.test(clause));
    const before = replies.length;
    if (durationPattern.test(clause)) {
      const hasPainSubject = /疼|痛|病程|起病|发病/.test(clause);
      const onlyPainTopics = matchingFacts.every(([topic]) => painTopics.includes(topic)) && !matchingPending.length;
      if (hasPainSubject && (onlyPainTopics || /腹痛|腹疼|肚子|左上腹/.test(clause))) replies.push(facts.duration);
      else if (!matchingFacts.length && !matchingPending.length) replies.push(durationFromContext(messages, caseData));
    }
    for (const [topic] of matchingFacts) replies.push(facts[topic]);
    for (const [topic] of matchingPending) replies.push(caseData.pendingTeacherConfirmation[topic]);
    if (replies.length === before && !/^(?:医生|您好?|你好|请问|谢谢|麻烦您?|我想问(?:一下)?|请告诉我|请您说说)$/.test(clause)) hasUnmatchedPart = true;
  }
  if (!replies.length && /什么不舒服|哪里不舒服|怎么不舒服|什么症状/.test(question)) replies.push(facts.location);
  if (replies.length && hasUnmatchedPart) replies.push(unmatchedPart);
  return replies.length ? [...new Set(replies)].join('') : null;
}
