type AnatomyKind = 'nodes' | 'skin' | 'neuro' | 'limbs'

const labels: Record<AnatomyKind, string[]> = {
  nodes: ['左锁骨上', '右锁骨上'],
  skin: ['面部与巩膜', '双手手掌', '躯干皮肤'],
  neuro: ['上肢反射', '膝反射', '跟腱反射'],
  limbs: ['左下肢', '右下肢'],
}

const images: Record<AnatomyKind, string> = { nodes: '淋巴结.png', skin: '皮肤巩膜.png', neuro: '神经.png', limbs: '腿部检查.png' }

const positions: Record<AnatomyKind, Array<{ left: string; top: string } | null>> = {
  nodes: [{ left: '64%', top: '29%' }, { left: '35%', top: '29%' }],
  skin: [{ left: '51%', top: '31%' }, null, { left: '52%', top: '61%' }],
  neuro: [{ left: '39%', top: '52%' }, { left: '46%', top: '76%' }, { left: '47%', top: '84%' }],
  limbs: [{ left: '57%', top: '58%' }, { left: '39%', top: '58%' }],
}

export function ExamMedicalIllustration({ kind, activePoint, disabled, onSelect }: {
  kind: AnatomyKind
  activePoint: string
  disabled: boolean
  onSelect: (point: string) => void
}) {
  const regionLabels = labels[kind]

  return <div className={`medical-illustration medical-illustration-${kind}`}>
    <div className="medical-art-wrap">
      <img className="exam-reference-image" src={`/exam-images/${images[kind]}`} alt={`${kind === 'nodes' ? '锁骨上淋巴结' : kind === 'skin' ? '皮肤巩膜' : kind === 'neuro' ? '神经系统' : '下肢'}卡通医学插画`} draggable={false} />
      {regionLabels.map((point, index) => positions[kind][index] && <button key={point} type="button" disabled={disabled} aria-label={point} title={point} aria-pressed={activePoint === point} className={activePoint === point ? 'is-active' : ''} style={positions[kind][index] ?? undefined} onClick={() => onSelect(point)} />)}
    </div>
    <div className="medical-region-labels">{regionLabels.map((point) => <button key={point} type="button" disabled={disabled} className={activePoint === point ? 'is-active' : ''} onClick={() => onSelect(point)}>{point}</button>)}</div>
  </div>
}
