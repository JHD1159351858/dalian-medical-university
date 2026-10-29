import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, Gauge, MousePointer2, ScanLine, Stethoscope, Timer } from 'lucide-react'
import type { ExamInstrument, PhysicalExamItem } from './examData'

interface InstrumentPanelProps {
  item: PhysicalExamItem
  started: boolean
  measured: boolean
  completed: boolean
  onStart: () => void
  onMeasure: () => void
  onComplete: () => void
}

const instrumentNames: Record<ExamInstrument, string> = {
  monitor: '床旁监护仪', 'neck-lamp': '颈部检查灯', 'inspection-lamp': '皮肤检查灯', 'body-scale': '体型评估仪',
  respiratory: '呼吸监测仪', ecg: '心电图 / 听诊器', neuro: '神经反射检查工具', edema: '下肢水肿检查仪',
  abdomen: '腹部九区触诊板', percussion: '腹部叩诊锤', stethoscope: '听诊器',
}

const instrumentIcons: Record<ExamInstrument, typeof Activity> = {
  monitor: Activity, 'neck-lamp': ScanLine, 'inspection-lamp': ScanLine, 'body-scale': Gauge,
  respiratory: Activity, ecg: Activity, neuro: ScanLine, edema: Gauge, abdomen: MousePointer2,
  percussion: MousePointer2, stethoscope: Stethoscope,
}

export function InstrumentPanel({ item, started, measured, completed, onStart, onMeasure, onComplete }: InstrumentPanelProps) {
  const [countdown, setCountdown] = useState<number | null>(null)
  const Icon = instrumentIcons[item.instrument]

  useEffect(() => setCountdown(null), [item.id])

  useEffect(() => {
    if (item.id !== 'bowel' || !started || measured || countdown !== null) return
    setCountdown(30)
  }, [countdown, item.id, measured, started])

  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      onMeasure()
      setCountdown(null)
      return
    }
    const timer = window.setTimeout(() => setCountdown((value) => value === null ? null : value - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [countdown, onMeasure])

  const isListening = countdown !== null && countdown > 0

  return <div className="instrument-panel">
    <div className="instrument-panel-head"><div className="instrument-icon"><Icon size={19} /></div><div><span>当前检查仪器</span><strong>{instrumentNames[item.instrument]}</strong></div><b className={completed ? 'is-measured' : ''}>{completed ? <><CheckCircle2 size={14} /> 已完成检查</> : measured ? '可结束检查' : started ? '检查进行中' : '待启动'}</b></div>
    {!started ? <div className="instrument-start"><div className="instrument-display-id">{item.id === 'vitals' ? 'MONITOR / 01' : `EXAM / ${item.id.toUpperCase()}`}</div><p>{item.hint}。完成后可在医院信息系统查看本项检查结果。</p><button type="button" onClick={onStart}><Icon size={16} /> 开始检查</button></div> : <>
      <div className="instrument-readout">
        {item.id === 'vitals' && <><div className="ecg-strip"><span>Ⅱ</span><i /></div><div className="instrument-scan"><Activity size={19} /><span>生命体征监测中<br /><small>测量完成后将结果保存至 HIS</small></span></div></>}
        {item.id === 'heart' && <><div className="ecg-strip compact"><span>ECG</span><i /></div><div className="instrument-scan"><Activity size={19} /><span>心电信号采集中<br /><small>听诊结束后查看检查报告</small></span></div></>}
        {item.id === 'respiration' && <div className="instrument-scan"><Activity size={19} /><span>呼吸监测中<br /><small>请完成胸部视诊与双肺听诊</small></span></div>}
        {item.id === 'bowel' && <><div className="listening-clock"><Timer size={17} /><strong>{isListening ? `听诊中 ${countdown}s` : measured ? '30 秒听诊完成' : '准备听诊'}</strong></div>{measured && <div className="instrument-scan"><CheckCircle2 size={19} /><span>听诊记录已保存<br /><small>可在医院信息系统查看结果</small></span></div>}</>}
        {item.id === 'abdomen' && <div className="abdomen-instrument-tip"><MousePointer2 size={16} /><span>请使用右侧九区触诊板完成腹部触诊</span></div>}
        {item.id !== 'vitals' && item.id !== 'heart' && item.id !== 'respiration' && item.id !== 'bowel' && item.id !== 'abdomen' && <div className="instrument-scan"><ScanLine size={19} /><span>检查区域已定位<br /><small>{item.hint}</small></span></div>}
      </div>
      {item.id === 'bowel' && isListening && <div className="instrument-progress"><i style={{ width: `${((30 - (countdown ?? 30)) / 30) * 100}%` }} /></div>}
      <div className="instrument-actions">
        <p>{completed ? '本项结果已写入医院信息系统。' : measured ? '检查已完成，可以结束本项并解锁检查报告。' : isListening ? '请保持听诊，计时结束后即可完成。' : '按下方按钮结束本项检查，随后查看电脑报告。'}</p>
        {measured && !completed && <button type="button" onClick={onComplete}>完成本项检查</button>}
      </div>
    </>}
  </div>
}
