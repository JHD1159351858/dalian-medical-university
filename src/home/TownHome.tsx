import { lazy, Suspense, useCallback, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { ArrowRight, BookOpen, ChartNoAxesCombined, ShieldCheck, Stethoscope } from 'lucide-react';
import { TownBackground } from './TownBackground';

const Training = lazy(() => import('../App'));

export default function TownHome() {
  const [mode, setMode] = useState<'home' | 'diving' | 'training'>('home');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const ready = useCallback(() => setStatus('ready'), []);
  const failed = useCallback(() => setStatus('error'), []);
  const startTraining = () => {
    useGLTF.preload('/models/hospital.glb');
    useGLTF.preload('/models/patient.glb');
    useGLTF.preload('/models/doctor.glb');
    setMode('diving');
  };
  if (mode === 'training') return <Suspense fallback={<div className="training-loading" role="status">正在准备实训场景…</div>}><Training autoStart /></Suspense>;
  return <main className="town-home">
    <TownBackground transitioning={mode === 'diving'} onDiveComplete={() => setMode('training')} onReady={ready} onError={failed} />
    <div className="town-shade" />
    <header className="town-header">
      <div className="brand-block" aria-label="首页品牌"><span className="brand-seal"><Stethoscope size={22} aria-hidden="true" /></span><div><strong>大连医科大学</strong><span>临床问诊实训</span></div></div>
      <span className="session-chip"><ShieldCheck size={15} aria-hidden="true" />教学模拟环境</span>
    </header>
    <section className="town-hero" aria-label="首页介绍">
      <div className="town-hero-copy">
        <span className="town-eyebrow">DALIAN MEDICAL UNIVERSITY</span>
        <h1>走进医院<br />成为<span>接诊医生</span></h1>
        <p>从第一句主诉，到一次完整的问诊。</p>
        <i className="town-hero-rule" aria-hidden="true" />
        <div className="town-features" aria-label="首页训练特色">
          <div><span><Stethoscope size={24} aria-hidden="true" /></span><p><strong>临床思维训练</strong><small>规范 · 系统 · 实践</small></p></div>
          <div><span><BookOpen size={24} aria-hidden="true" /></span><p><strong>典型案例库</strong><small>真实 · 多源 · 更新</small></p></div>
          <div><span><ChartNoAxesCombined size={24} aria-hidden="true" /></span><p><strong>能力评估反馈</strong><small>可视 · 量化 · 提升</small></p></div>
        </div>
      </div>
      <aside className="town-motto"><strong>厚德尚医<br />笃行致远</strong><i aria-hidden="true" /><span>VIRTUE<br />MEDICINE<br />PRACTICE<br />FUTURE</span></aside>
    </section>
    <section className="town-welcome" aria-label="实训入口">
      <div><h2>走进医院，成为接诊医生。</h2><p>从第一句主诉，到一次完整的问诊。</p></div>
      <button type="button" className="town-start" onClick={startTraining} disabled={mode === 'diving'}>开始实训<ArrowRight size={20} aria-hidden="true" /></button>
    </section>
    {mode === 'diving' && <div className="town-transition-overlay" role="status"><span>正在进入医院</span><i /></div>}
    <footer className="town-footer"><span>医院小镇 <i /> 临床情境模拟</span><span role="status">{status === 'loading' ? '正在载入小镇，可直接开始实训' : status === 'error' ? '小镇暂未载入，仍可开始实训' : '准备好，迎接你的第一位患者。'}</span></footer>
  </main>;
}
