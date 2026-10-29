import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { AuxiliaryReport, LaboratoryResult } from './auxiliaryExamData'

export function LaboratoryTable({ values }: { values: LaboratoryResult[] }) {
  return <table className="aux-lab-results">
    <thead><tr><th scope="col">项目名称</th><th scope="col">结果</th><th scope="col">单位</th><th scope="col">提示</th><th scope="col">参考值</th></tr></thead>
    <tbody>{values.map((entry) => <tr key={entry.code ?? entry.label} className={entry.flag === 'H' ? 'is-high' : entry.flag === 'L' ? 'is-low' : ''}>
      <th scope="row">{entry.label}{entry.code && <small>{entry.code}</small>}</th><td>{entry.value}</td><td>{entry.unit || '—'}</td><td><span className="aux-lab-flag">{entry.flag === 'H' ? '↑ 偏高' : entry.flag === 'L' ? '↓ 偏低' : entry.flag === 'N' ? '正常' : '—'}</span></td><td>{entry.reference || '—'}</td>
    </tr>)}</tbody>
  </table>
}

export function AuxiliaryReportViewer({ title, report, onClose }: { title: string; report: AuxiliaryReport; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialogRef.current?.showModal() }, [])

  return <dialog ref={dialogRef} className={`aux-report-dialog ${report.image ? 'is-imaging' : ''}`} aria-labelledby="aux-viewer-title" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <header><div><span>{report.category} · 病例资料</span><h2 id="aux-viewer-title">{report.title ?? title}</h2></div><button type="button" aria-label="关闭检查报告" onClick={onClose}><X size={24} /></button></header>
    <div className="aux-report-patient"><span>患者 <b>王旭</b></span><span>性别 <b>男</b></span><span>年龄 <b>48 岁</b></span>{report.values && <span className="aux-report-source">检验结果及参考值按提供资料整理</span>}</div>
    <div className="aux-viewer-content">{report.image ? <figure><img src={report.image.src} alt={report.image.alt} /><figcaption>{report.image.alt} · 原始病例影像</figcaption></figure> : report.values && <LaboratoryTable values={report.values} />}{report.note && <p className="aux-report-note">{report.note}</p>}</div>
    <footer><span>{report.image ? '查看影像后，返回填写检查所见。' : '↑ 偏高 · ↓ 偏低 · — 原资料未列出'}</span><button type="button" onClick={onClose}>返回并记录</button></footer>
  </dialog>
}
