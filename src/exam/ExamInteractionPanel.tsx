import { useState, type ReactNode } from 'react'
import { Monitor } from 'lucide-react'
import { ExamMedicalIllustration } from './ExamMedicalIllustration'

type IllustrationKind = 'nodes' | 'skin' | 'neuro' | 'limbs'

const reportCases: Record<string, { title: string; section: string; image?: string }> = {
  nutrition: { title: '营养状态', section: '一般情况', image: '营养状态.png' },
  respiration: { title: '呼吸检查', section: '胸部', image: '呼吸.png' },
  heart: { title: '心律与心音', section: '心血管' },
  percussion: { title: '腹部叩诊', section: '腹部', image: '腹部叩诊.png' },
  bowel: { title: '肠鸣音', section: '腹部', image: '肠鸣声.png' },
}

const illustrations: Record<IllustrationKind, { title: string; hint: string; response: string }> = {
  nodes: { title: '锁骨上淋巴结触诊', hint: '点击图中锁骨上窝，分别完成左右触诊', response: '该侧已检查，请继续另一侧并结合电脑结果记录' },
  skin: { title: '皮肤与巩膜观察', hint: '点击面部、手掌或躯干，切换观察部位', response: '已选中观察部位，请按电脑报告描述发现' },
  neuro: { title: '神经系统检查', hint: '点击相应位置，完成反射检查', response: '已标记检查部位，请结合双侧表现记录' },
  limbs: { title: '下肢检查', hint: '点击小腿位置，进行按压并观察回弹', response: '已完成该侧按压观察，请对照双侧情况记录' },
}

export function ExamInteractionPanel({ itemId, enabled, selectedRegion, children, onOpenComputer }: {
  itemId: string
  enabled: boolean
  selectedRegion: string
  children: ReactNode
  onOpenComputer: (category: string) => void
}) {
  const [activePoint, setActivePoint] = useState('')

  if (itemId === 'inspection') return <section className="exam-card exam-map-card exam-interaction" aria-label="检查互动台">
    <div className="exam-card-label">腹部视触诊 <span>九区触诊</span></div>
    <div className="abdomen-silhouette" aria-label="腹部轮廓"><img className="exam-reference-image" src="/exam-images/腹部.jpg" alt="腹部九区检查示意图" draggable={false} /><div className={`abdomen-map ${enabled ? 'is-enabled' : ''}`} aria-label="腹部九区触诊地图">{children}</div></div>
    <div className="exam-map-footer">{enabled ? `已定位：${selectedRegion} · 按住区域检查压痛，松开检查反跳痛` : '开单腹部视触诊后可进行触诊'}</div>
  </section>

  if (itemId === 'vitals') return <section className="exam-card exam-map-card exam-interaction" aria-label="检查互动台">
    <div className="exam-card-label">床旁监护仪 <span>{enabled ? '监护中' : '待开单'}</span></div>
    <div className="monitor-scene" aria-label="动态心电图">
      <div className="monitor-top"><span>GT9000　·　床旁 01</span><span>Ⅱ　 25 mm/s　 <b>● 监护中</b></span></div>
      <div className="monitor-body">
        <div className="monitor-traces" aria-label="多通道监护波形">
          <div className="monitor-trace trace-ecg"><small>Ⅱ</small><svg viewBox="0 0 270 36" role="img" aria-label="心电波形" preserveAspectRatio="none"><path d="M0 18H30l5-2 5 4 7-15 7 25 7-12 6 0h28l5-2 5 4 7-15 7 25 7-12 6 0h28l5-2 5 4 7-15 7 25 7-12 6 0h28l5-2 5 4 7-15 7 25 7-12 6 0h32" /></svg></div>
          <div className="monitor-trace trace-ecg-alt"><small>Ⅲ</small><svg viewBox="0 0 270 36" role="img" aria-label="第二通道心电波形" preserveAspectRatio="none"><path d="M0 19h37l7-3 7 6 8-8 8 5h31l7-3 7 6 8-8 8 5h31l7-3 7 6 8-8 8 5h31l7-3 7 6 8-8 8 5h31" /></svg></div>
          <div className="monitor-trace trace-resp"><small>RESP</small><svg viewBox="0 0 270 36" role="img" aria-label="呼吸波形" preserveAspectRatio="none"><path d="M0 20c12-17 23-17 34 0s23 17 34 0 23-17 34 0 23 17 34 0 23-17 34 0 23 17 34 0 23-17 34 0 23 17 34 0 23-17 34 0" /></svg></div>
          <div className="monitor-trace trace-resp-alt"><small>RESP</small><svg viewBox="0 0 270 36" role="img" aria-label="呼吸趋势波形" preserveAspectRatio="none"><path d="M0 20c12-8 23-8 34 0s23 8 34 0 23-8 34 0 23 8 34 0 23-8 34 0 23 8 34 0 23-8 34 0 23 8 34 0 23-8 34 0" /></svg></div>
        </div>
        <div className="monitor-readouts" aria-label="生命体征读数">
          <div className="monitor-readout readout-pulse"><small>PR</small><strong>118</strong><em>bpm</em></div>
          <div className="monitor-readout readout-resp"><small>RESP</small><strong>32</strong><em>/min</em></div>
          <div className="monitor-readout readout-pressure"><small>NIBP</small><strong>149<span>/</span>92</strong><em>mmHg</em></div>
          <div className="monitor-readout readout-temp"><small>T1</small><strong>37.5</strong><em>°C</em></div>
        </div>
      </div>
      <div className="monitor-bottom"><span>报警　静音　趋势</span><span>信号良好　10:15:32</span></div>
    </div>
    <div className="interaction-description"><strong>{enabled ? '生命体征监护已连接' : '开具基本生命体征后查看'}</strong><span>学生记录请以医院信息系统中的病例结果为准。</span></div>
  </section>

  if (reportCases[itemId]) return <section className="exam-card exam-map-card exam-interaction exam-report-card" aria-label="检查互动台">
    <div className="exam-card-label">{reportCases[itemId].title} <span>病例报告</span></div>
    {reportCases[itemId].image ? <img className="exam-reference-image exam-report-image" src={`/exam-images/${reportCases[itemId].image}`} alt={`${reportCases[itemId].title}检查示意图`} draggable={false} /> : <div className="exam-report-screen"><div><span>HIS</span><b>检查结果已生成</b></div><p>{reportCases[itemId].section} · 王旭 · 2025-09-23</p><i /></div>}
    <div className="exam-report-copy"><strong>请根据查看电脑中的结果填写</strong><span>本项检查结果已在医院信息系统中，请先查看报告，再在中间记录栏描述检查发现。</span></div>
    <button className="exam-report-open" type="button" disabled={!enabled} onClick={() => onOpenComputer(reportCases[itemId].section)}><Monitor size={15} /> 查看电脑报告</button>
  </section>

  const kind = itemId as IllustrationKind
  const illustration = illustrations[kind]
  if (!illustration) return <section className="exam-card exam-map-card exam-interaction" aria-label="检查互动台"><div className="exam-interaction-empty">选择一项已开具的检查</div></section>

  return <section className="exam-card exam-map-card exam-interaction" aria-label="检查互动台">
    <div className="exam-card-label">{illustration.title} <span>{enabled ? '检查定位' : '待开单'}</span></div>
    <ExamMedicalIllustration kind={kind} activePoint={activePoint} disabled={!enabled} onSelect={setActivePoint} />
    <div className="interaction-description"><strong>{activePoint ? `${activePoint} · 已选中` : enabled ? illustration.hint : '开具该项目后查看检查部位'}</strong><span>{enabled && activePoint ? illustration.response : '病例检查结果请在医院信息系统中查看。'}</span></div>
  </section>
}
