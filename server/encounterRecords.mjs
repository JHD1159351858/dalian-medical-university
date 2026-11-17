const MAX_BODY_BYTES = 512 * 1024;
const METADATA_COLUMNS = 'id,student_id,case_id,patient_name,patient_age,patient_sex,started_at,ended_at,status,updated_at';
const REGIONS = ['right-upper', 'upper', 'left-upper', 'right-middle', 'center', 'left-middle', 'right-lower', 'lower', 'left-lower'];
/** @param {number} status
 * @param {string} message */
const error = (status, message) => ({ status, body: { error: message } });

/** @typedef {Record<string, string | undefined>} RecordsEnvironment */
/** @param {unknown} value
 * @returns {value is Record<string, unknown>} */
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value
 * @returns {value is string} */
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** @param {unknown} value
 * @returns {value is string} */
const text = (value, limit = 20_000) => typeof value === 'string' && value.length <= limit;
/** @param {unknown} value
 * @returns {value is string} */
const iso = (value) => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
const textMap = (value) => object(value) && Object.entries(value).every(([key, entry]) => key.length <= 120 && text(entry));

/** @param {RecordsEnvironment} env */
function configuration(env) {
  const legacy = [env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, env.SUPABASE_ANON_KEY].some((value) => value?.trim());
  const key = (legacy ? env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '' : env.CODER_SUPABASE_ANON_KEY || '').trim();
  const tenantId = legacy ? '' : (env.CODER_SUPABASE_TENANT_ID || '').trim();
  if (tenantId.length > 256 || /[\u0000-\u001f\u007f]/.test(tenantId)) return null;
  if (key.startsWith('sb_secret_')) return null;
  let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey && key.split('.').length === 3) {
    try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role === 'anon'; } catch { publicKey = false; }
  }
  if (!publicKey) return null;
  try {
    const url = new URL((legacy ? env.SUPABASE_URL : env.CODER_SUPABASE_URL) || '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return { url: url.href.replace(/\/+$/, ''), publishableKey: key, ...(tenantId ? { tenantId } : {}) };
  } catch { return null; }
}

/** @param {RecordsEnvironment} env */
export function recordsConfiguration(env = process.env) {
  const config = configuration(env);
  return config ? { status: 200, body: config } : error(503, '云端接诊记录尚未配置。');
}

function physicalExam(value) {
  if (value === null) return true;
  if (!object(value) || !Array.isArray(value.orderedIds) || !value.orderedIds.every((id) => text(id, 120)) || !textMap(value.notes) || !textMap(value.submittedNotes) || !Array.isArray(value.history)) return false;
  return value.history.every((entry) => object(entry) && ['pressure', 'rebound'].includes(entry.type) && REGIONS.includes(entry.region)
    && ['neutral', 'pain', 'severe-pain'].includes(entry.expression) && ['normal', 'tender', 'no-rebound', 'rebound-positive'].includes(entry.result)
    && typeof entry.isTeachingDemo === 'boolean' && Number.isSafeInteger(entry.at) && entry.at >= 0);
}

function treatment(value) {
  if (!object(value) || !Array.isArray(value.treatments) || !Array.isArray(value.medications)) return false;
  return value.treatments.every((row) => object(row) && ['id', 'category', 'item'].every((key) => text(row[key])))
    && value.medications.every((row) => object(row) && ['id', 'name', 'route', 'dose'].every((key) => text(row[key])) && (row.frequency === undefined || text(row.frequency)));
}

function validMetadata(value) {
  return object(value) && uuid(value.id) && text(value.caseId, 120) && value.caseId.trim() && object(value.patient)
    && text(value.patient.name, 120) && value.patient.name.trim() && Number.isInteger(value.patient.age) && value.patient.age >= 0 && value.patient.age <= 130
    && text(value.patient.sex, 40) && value.patient.sex.trim() && iso(value.startedAt) && (value.endedAt === null || iso(value.endedAt))
    && ['in_progress', 'completed', 'ended'].includes(value.status);
}

/** @param {unknown} value
 * @returns {value is import('../src/records/types').EncounterRecord} */
function validEncounter(value) {
  if (!validMetadata(value) || !object(value) || !object(value.snapshot) || !Array.isArray(value.submissions)) return false;
  const snapshot = value.snapshot;
  return Array.isArray(snapshot.messages) && snapshot.messages.every((message) => object(message) && ['user', 'assistant'].includes(message.role) && text(message.content))
    && textMap(snapshot.fourDiagnosis) && textMap(snapshot.auxiliaryExam) && textMap(snapshot.clinicalDiagnosis) && treatment(snapshot.treatment) && physicalExam(snapshot.physicalExam)
    && value.submissions.every((entry) => object(entry) && uuid(entry.id) && ['physical-exam', 'tongue', 'pulse', 'treatment'].includes(entry.kind) && iso(entry.at) && object(entry.payload));
}

/** @param {Record<string, unknown>} row */
function fromRow(row, detail) {
  const record = {
    id: row.id, caseId: row.case_id, patient: { name: row.patient_name, age: row.patient_age, sex: row.patient_sex },
    startedAt: row.started_at, endedAt: row.ended_at, status: row.status,
    ...(iso(row.updated_at) ? { updatedAt: row.updated_at } : {}),
    ...(detail ? { snapshot: row.snapshot, submissions: row.submissions } : {}),
  };
  return (detail ? validEncounter(record) : validMetadata(record)) ? record : null;
}

/** @param {Request} request */
export async function readEncounterBody(request) {
  if (!request.body) return { status: 400, error: '接诊记录格式无效。' };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let content = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); return { status: 413, error: '接诊记录不能超过512KB。' }; }
      content += decoder.decode(chunk.value, { stream: true });
    }
    return { status: 200, value: /** @type {unknown} */ (JSON.parse(content + decoder.decode())) };
  } catch { return { status: 400, error: '接诊记录格式无效。' }; }
  finally { reader.releaseLock(); }
}

/**
 * @param {{ method: 'GET' | 'PUT', url: string, authorization?: string | null, body?: unknown }} input
 * @param {{ env?: RecordsEnvironment, fetchImpl?: typeof fetch, signal?: AbortSignal, timeoutMs?: number }} options
 */
export async function encounterRecords(input, { env = process.env, fetchImpl = globalThis.fetch, signal, timeoutMs = 15_000 } = {}) {
  const config = configuration(env);
  if (!config) return error(503, '云端接诊记录尚未配置。');
  const bearer = typeof input.authorization === 'string' ? /^Bearer\s+([^\s]+)$/i.exec(input.authorization)?.[1] : null;
  if (!bearer) return error(401, '请先登录学生账号。');
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
  const headers = { apikey: config.publishableKey, authorization: `Bearer ${bearer}`, ...(config.tenantId ? { 'X-Instance-ID': config.tenantId } : {}) };
  try {
    const auth = await fetchImpl(`${config.url}/auth/v1/user`, { headers, signal: controller.signal });
    if (auth.status === 401 || auth.status === 403) return error(401, '学生登录已失效，请重新登录。');
    if (!auth.ok) return error(502, '学生登录验证暂时不可用。');
    const user = /** @type {unknown} */ (await auth.json().catch(() => null));
    if (!object(user) || !uuid(user.id)) return error(401, '学生登录验证失败。');
    const owner = user.id;
    const url = new URL(`${config.url}/rest/v1/encounter_records`);
    let body;
    let detail = input.method === 'PUT';
    if (input.method === 'PUT') {
      if (input.body === undefined) return error(400, '接诊记录格式无效。');
      if (Buffer.byteLength(JSON.stringify(input.body), 'utf8') > MAX_BODY_BYTES) return error(413, '接诊记录不能超过512KB。');
      if (!validEncounter(input.body)) return error(400, '接诊记录格式无效。');
      const record = input.body;
      body = JSON.stringify({ id: record.id, student_id: owner, case_id: record.caseId, patient_name: record.patient.name, patient_age: record.patient.age, patient_sex: record.patient.sex, started_at: record.startedAt, ended_at: record.endedAt, status: record.status, snapshot: record.snapshot, submissions: record.submissions });
      url.searchParams.set('on_conflict', 'id');
      url.searchParams.set('select', '*');
    } else {
      const query = new URL(input.url, 'http://localhost').searchParams;
      detail = query.has('id');
      if (detail) {
        if (!uuid(query.get('id'))) return error(400, '接诊记录编号无效。');
        url.searchParams.set('id', `eq.${query.get('id')}`);
      } else {
        const offset = query.get('offset') ?? '0';
        if (!/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset))) return error(400, '接诊记录分页参数无效。');
        url.searchParams.set('offset', offset);
        url.searchParams.set('limit', '51');
        url.searchParams.set('order', 'updated_at.desc,id.desc');
      }
      url.searchParams.set('student_id', `eq.${owner}`);
      url.searchParams.set('select', detail ? '*' : METADATA_COLUMNS);
    }
    const upstream = await fetchImpl(url, {
      method: input.method === 'PUT' ? 'POST' : 'GET',
      headers: { ...headers, ...(body ? { 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' } : {}) },
      body, signal: controller.signal,
    });
    if (upstream.status === 401) return error(401, '学生登录已失效，请重新登录。');
    if (upstream.status === 403) return error(403, '无权访问这条接诊记录。');
    if (upstream.status === 404) return error(503, '云端接诊记录表尚未初始化。');
    if (!upstream.ok) return error(502, '云端接诊记录暂时不可用。');
    const rows = /** @type {unknown} */ (await upstream.json().catch(() => null));
    if (!Array.isArray(rows) || !rows.every((row) => object(row) && row.student_id === owner)) return error(502, '云端接诊记录返回异常。');
    if (detail && !rows.length) return error(input.method === 'GET' ? 404 : 502, input.method === 'GET' ? '未找到这条接诊记录。' : '云端尚未确认保存记录。');
    const records = rows.slice(0, detail ? 1 : 50).map((row) => fromRow(row, detail));
    if (records.some((record) => record === null)) return error(502, '云端接诊记录返回异常。');
    return { status: 200, body: detail ? { record: records[0] } : { records, hasMore: rows.length > 50 } };
  } catch {
    return error(controller.signal.aborted && controller.signal.reason instanceof Error && controller.signal.reason.message === 'timeout' ? 504 : 502, '云端接诊记录暂时不可用。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
