import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, ClipboardList, RefreshCw, X } from 'lucide-react'
import { moduleItems } from '../clinical/caseData'
import { physicalExamItems } from '../exam/examData'
import { useEncounterRecords } from './EncounterRecordsProvider'
import type { EncounterRecord, EncounterSummary, SubmissionKind } from './types'
import './encounterRecords.css'

const statuses: Record<EncounterSummary['status'], string> = { in_progress: '接诊中', completed: '已完成', ended: '已结束' }
const submissionNames: Record<SubmissionKind, string> = { 'physical-exam': '体格检查提交', tongue: '舌诊判断提交', pulse: '脉诊判断提交', treatment: '处置方案提交' }
const fieldNames: Record<string, string> = {
  ...Object.fromEntries(physicalExamItems.map(({ id, label }) => [id, label])),
  notes: '检查笔记', submittedNotes: '已提交的检查记录', orderedIds: '已选择检查', history: '腹部触诊操作',
  selected: '脉象判断', readings: '各部触诊所见', middle: '中指 · 关部', index: '食指 · 寸部', ring: '无名指 · 尺部', light: '轻取', deep: '深取',
  answer: '学生判断', observation: '观察依据', correct: '核对结果', result: '反馈结果', message: '反馈说明',
  diagnosis: '诊断记录', plan: '处置方案', treatments: '处置措施', medications: '用药记录', category: '类别', item: '措施', name: '药物名称', route: '给药途径', dose: '剂量',
  label: '检查项目', note: '检查记录', type: '操作方式', region: '检查部位', expression: '患者反应', isTeachingDemo: '教学演示', at: '操作时间',
  status: '评价状态', checks: '评价要点', outcome: '核对结果', studentText: '学生填写', reason: '评价说明', reference: '参考依据', ai: '补充评价',
  expected: '参考判断', missing: '待补充', extra: '需核对', selectedCorrect: '判断一致', primary: '西医主要诊断', secondary: '西医次要诊断', tcm: '中医诊断', summary: '总结',
  standardAnswer: '参考脉象', studentAnswer: '学生判断', missed: '待补充的脉象', explanation: '核对说明',
  caseAssessment: '病例参考总评', score: '得分', maxScore: '满分', modules: '分项评分', feedback: '评分反馈', scopeNote: '核对范围', teacherApproved: '教师审核', completed: '完成病例提交',
}
const valueNames: Record<string, string> = {
  ...Object.fromEntries(physicalExamItems.map(({ id, label }) => [id, label])),
  'right-upper': '右季肋区', upper: '腹上区', 'left-upper': '左季肋区', 'right-middle': '右腰区', center: '脐区', 'left-middle': '左腰区', 'right-lower': '右髂区', lower: '腹下区', 'left-lower': '左髂区',
  pressure: '按压', rebound: '反跳痛检查', neutral: '平静', pain: '疼痛反应', 'severe-pain': '明显疼痛反应', normal: '无明显异常', tender: '压痛', 'no-rebound': '无反跳痛', 'rebound-positive': '反跳痛阳性',
  passed: '符合参考', needs_revision: '待修改', pending_review: '待复核', met: '符合参考', missing: '未填写', incorrect: '需修改', unreviewed: '待复核', rules: '病例规则核对', case_reference: '病例参考',
  not_configured: '未配置', available: '可用', unavailable: '暂不可用', awaiting_standard: '待补充标准',
}

function timeLabel(value: string | number) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未记录' : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
}

function hasValue(value: unknown): boolean {
  if (typeof value === 'string') return Boolean(value.trim())
  if (Array.isArray(value)) return value.some(hasValue)
  if (value && typeof value === 'object') return Object.entries(value).some(([key, entry]) => !['id', 'caseId', 'examId', 'sampleId'].includes(key) && hasValue(entry))
  return typeof value === 'number' || typeof value === 'boolean'
}

function RecordedValue({ value, field = '' }: { value: unknown; field?: string }) {
  if (!hasValue(value)) return <span className="enc-record-empty-value">尚未记录</span>
  if (typeof value === 'boolean') return <span>{field === 'correct' ? value ? '与参考一致' : '需再核对' : value ? '是' : '否'}</span>
  if ((field === 'at' || field === 'startedAt' || field === 'endedAt') && (typeof value === 'number' || typeof value === 'string')) return <span>{timeLabel(value)}</span>
  if (typeof value === 'string' || typeof value === 'number') return <span>{valueNames[String(value)] ?? String(value)}</span>
  if (Array.isArray(value)) return <ul className="enc-record-values">{value.filter(hasValue).map((entry, index) => <li key={index}><RecordedValue value={entry} /></li>)}</ul>
  if (value && typeof value === 'object') return <dl className="enc-record-fields">{Object.entries(value).filter(([key, entry]) => !['id', 'caseId', 'examId', 'sampleId'].includes(key) && hasValue(entry)).map(([key, entry]) => <div key={key}><dt>{fieldNames[key] ?? (/[\u3400-\u9fff]/.test(key) ? key : '补充记录')}</dt><dd><RecordedValue value={entry} field={key} /></dd></div>)}</dl>
  return null
}

function ModuleRecords({ value, module }: { value: Record<string, string>; module: 'fourDiagnosis' | 'auxiliaryExam' | 'clinicalDiagnosis' }) {
  const entries = Object.entries(value).filter(([, text]) => text.trim())
  if (!entries.length) return <p className="enc-record-empty-value">尚未填写记录</p>
  return <dl className="enc-record-fields">{entries.map(([id, text]) => <div key={id}><dt>{moduleItems[module].find((item) => item.id === id)?.label ?? '补充记录'}</dt><dd>{text}</dd></div>)}</dl>
}

export function EncounterRecordDetails({ record }: { record: EncounterRecord }) {
  const snapshot = record.snapshot
  return <article className="enc-record-detail">
    <div className="enc-record-patient"><div><h3>{record.patient.name}</h3><p>{record.patient.sex} · {record.patient.age} 岁</p></div><span className={`enc-record-status is-${record.status}`}>{statuses[record.status]}</span></div>
    <dl className="enc-record-times"><div><dt>开始接诊</dt><dd>{timeLabel(record.startedAt)}</dd></div><div><dt>结束接诊</dt><dd>{record.endedAt ? timeLabel(record.endedAt) : '尚未结束'}</dd></div></dl>
    <section><h3>问诊对话</h3>{snapshot.messages.length ? <ol className="enc-record-messages">{snapshot.messages.map((message, index) => <li key={index}><strong>{message.role === 'user' ? '学生医生' : '患者'}</strong><p>{message.content}</p></li>)}</ol> : <p className="enc-record-empty-value">尚无问诊对话</p>}</section>
    <section><h3>体格检查</h3><RecordedValue value={snapshot.physicalExam} /></section>
    <section><h3>中医四诊</h3><ModuleRecords value={snapshot.fourDiagnosis} module="fourDiagnosis" /></section>
    <section><h3>辅助检查</h3><ModuleRecords value={snapshot.auxiliaryExam} module="auxiliaryExam" /></section>
    <section><h3>诊断记录</h3><ModuleRecords value={snapshot.clinicalDiagnosis} module="clinicalDiagnosis" /></section>
    <section><h3>处置与用药</h3><RecordedValue value={snapshot.treatment} /></section>
    <section><h3>历次提交 <small>{record.submissions.length} 次</small></h3>{record.submissions.length ? <ol className="enc-record-submissions">{record.submissions.map((submission) => <li key={submission.id}><header><strong>{submissionNames[submission.kind]}</strong><time dateTime={submission.at}>{timeLabel(submission.at)}</time></header><RecordedValue value={submission.payload} /></li>)}</ol> : <p className="enc-record-empty-value">尚无已提交内容</p>}</section>
  </article>
}

export function EncounterRecordsList({ records, loading, hasMore, onSelect, onLoadMore }: {
  records: EncounterSummary[]; loading: boolean; hasMore: boolean
  onSelect: (record: EncounterSummary) => void; onLoadMore: () => void
}) {
  return <div className="enc-record-list">
    {!records.length && !loading && <div className="enc-record-empty"><ClipboardList size={36} /><p>当前学生账号还没有已保存的接诊记录。</p></div>}
    {records.length > 0 && <div className="enc-record-table-wrap"><table><thead><tr><th>患者</th><th>接诊时间</th><th>状态</th><th><span className="enc-record-visually-hidden">操作</span></th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.patient.name}</strong><small>{record.patient.sex} · {record.patient.age} 岁</small></td><td><time dateTime={record.startedAt}>{timeLabel(record.startedAt)}</time></td><td><span className={`enc-record-status is-${record.status}`}>{statuses[record.status]}</span></td><td><button type="button" disabled={loading} onClick={() => onSelect(record)} aria-label={`查看${record.patient.name}的接诊详情`}>查看详情<ChevronRight size={16} /></button></td></tr>)}</tbody></table></div>}
    {loading && <p className="enc-record-loading" role="status">正在读取接诊记录…</p>}
    {(records.length > 0 || hasMore) && <footer><span>已加载 {records.length} 条记录</span>{hasMore && <button type="button" disabled={loading} onClick={onLoadMore}>加载更多</button>}</footer>}
  </div>
}

function RecordsWindow({ onClose }: { onClose: () => void }) {
  const { access, saveState, error, loadList, loadRecord, retrySave } = useEncounterRecords()
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef(0)
  const listOffset = useRef(0)
  const [records, setRecords] = useState<EncounterSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(access === 'ready')
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<EncounterSummary | null>(null)
  const [detail, setDetail] = useState<EncounterRecord | null>(null)

  const fetchList = useCallback(async (offset = 0) => {
    const id = ++request.current
    listOffset.current = offset
    setLoading(true)
    setLoadError('')
    try {
      const result = await loadList(offset)
      if (id !== request.current) return
      setRecords((previous) => offset ? [...previous, ...result.records] : result.records)
      setHasMore(result.hasMore)
    } catch (failure) {
      if (id === request.current) setLoadError(failure instanceof Error ? failure.message : '接诊记录读取失败，请重试。')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [loadList])

  const selectRecord = useCallback(async (record: EncounterSummary) => {
    const id = ++request.current
    setSelected(record)
    setDetail(null)
    setLoading(true)
    setLoadError('')
    try {
      const result = await loadRecord(record.id)
      if (id === request.current) setDetail(result)
    } catch (failure) {
      if (id === request.current) setLoadError(failure instanceof Error ? failure.message : '接诊详情读取失败，请重试。')
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [loadRecord])

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
    return () => { request.current += 1; if (element?.open) element.close() }
  }, [])
  useEffect(() => {
    if (access === 'ready') void fetchList()
    return () => { request.current += 1 }
  }, [access, fetchList])

  return <dialog ref={dialog} className="enc-record-dialog" aria-labelledby="enc-record-title" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header className="enc-record-dialog-header"><div><span>医院前台 · 学生接诊档案</span><h2 id="enc-record-title">接诊记录</h2></div><button type="button" aria-label="关闭接诊记录" onClick={onClose}><X size={22} /></button></header>
    <div className="enc-record-dialog-body">
      {access === 'loading' && <p role="status">正在确认学生身份…</p>}
      {access === 'unconfigured' && <div className="enc-record-empty"><ClipboardList size={36} /><h3>接诊记录服务尚未配置</h3><p>请联系教师或管理员配置记录服务。配置完成并登录后，可查看自己已保存的记录。</p></div>}
      {access === 'signed_out' && <div className="enc-record-empty"><ClipboardList size={36} /><h3>请先登录学生账号</h3><p>通过学校统一登录进入后，可查看自己已保存的接诊记录。</p></div>}
      {access === 'ready' && <>
        <div className="enc-record-toolbar">{selected ? <button type="button" onClick={() => { request.current += 1; setSelected(null); setDetail(null); setLoading(false); setLoadError('') }}><ArrowLeft size={17} />返回记录列表</button> : <p>仅显示当前学生账号的接诊记录</p>}<button type="button" disabled={loading} onClick={() => { if (selected) void selectRecord(selected); else void fetchList() }} aria-label="刷新接诊记录"><RefreshCw size={16} />刷新</button></div>
        {saveState === 'saving' && <p className="enc-record-loading" role="status">正在保存本次接诊…</p>}
        {saveState === 'error' && <div className="enc-record-error" role="alert"><p>接诊记录尚未成功保存。{error}</p><button type="button" onClick={retrySave}>重试保存</button></div>}
        {loadError && <div className="enc-record-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => { if (selected) void selectRecord(selected); else void fetchList(listOffset.current) }}>重新读取</button></div>}
        {selected ? detail ? <EncounterRecordDetails record={detail} /> : loading ? <p className="enc-record-loading" role="status">正在读取接诊详情…</p> : null : (!loadError || records.length > 0) && <EncounterRecordsList records={records} loading={loading} hasMore={hasMore} onSelect={(record) => void selectRecord(record)} onLoadMore={() => void fetchList(records.length)} />}
      </>}
    </div>
  </dialog>
}

export function EncounterRecordsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { studentId, access } = useEncounterRecords()
  return open ? <RecordsWindow key={`${studentId ?? 'anonymous'}:${access}`} onClose={onClose} /> : null
}
