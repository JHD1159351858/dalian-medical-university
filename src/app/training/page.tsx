'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { useProgress } from '@react-three/drei';
import { RotateCcw, ShieldCheck, Stethoscope, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { requestReply, checkChatAvailability, type ChatMessage } from '@/diagnosis/chat';
import { DiagnosisPage, type ConversationStatus } from '@/diagnosis/DiagnosisPage';
import { PATIENT_OPENING } from '@/clinical/caseData';
import ClinicalModulePage from '@/clinical/ClinicalModulePage';
import { createInitialTreatmentPlan, type TreatmentPlan } from '@/clinical/treatmentPlan';
import { initialFlow, transition } from './flow';
import World, { clearModelCache } from '@/scene/World';
import { emotionForSpeech, preloadSpeech, speakChinese, startSpeechStream, stopSpeech, type SpeechStreamController } from '@/diagnosis/speech';
import { PATIENT_VOICE_PROFILE } from '@/diagnosis/voiceProfiles';

const phaseLabels: Record<string, string> = {
  loading: '载入临床场景',
  ready: '准备进入诊室',
  walking: '前往接诊区',
  waiting: '患者等待接诊',
  patientSpeech: '听取患者主诉',
  doctorDialog: '根据主诉开始问诊',
  diagnosis: '问诊进行中',
  physicalExam: '体格检查进行中',
  fourDiagnosis: '中医四诊进行中',
  auxiliaryExam: '辅助检查进行中',
  clinicalDiagnosis: '诊断记录进行中',
  treatment: '处置方案进行中',
  exiting: '患者正在离院',
  completed: '本次接诊已结束',
};

export default function TrainingPage() {
  const router = useRouter();
  const [flow, sendFlow] = useReducer(transition, initialFlow);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [sceneError, setSceneError] = useState('');
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [conversationStatus, setConversationStatus] = useState<ConversationStatus>('checking');
  const [conversationError, setConversationError] = useState('');
  const [canInteract, setCanInteract] = useState(false);
  const [fourDiagnosisRecords, setFourDiagnosisRecords] = useState<Record<string, string>>({});
  const [auxiliaryExamRecords, setAuxiliaryExamRecords] = useState<Record<string, string>>({});
  const [clinicalDiagnosisRecords, setClinicalDiagnosisRecords] = useState<Record<string, string>>({});
  const [treatmentPlan, setTreatmentPlan] = useState<TreatmentPlan>(createInitialTreatmentPlan());
  const [arrivalNotice, setArrivalNotice] = useState(false);
  const movementInput = useRef({ x: 0, y: 0 });
  const patientView = useRef<HTMLDivElement>(null);
  const doctorView = useRef<HTMLDivElement>(null);
  const requestRef = useRef<{ controller: AbortController; id: number } | null>(null);
  const speechStreamRef = useRef<SpeechStreamController | null>(null);
  const requestId = useRef(0);
  const { progress } = useProgress();

  const isDiagnosis = flow.phase === 'diagnosis';
  const canChat = isDiagnosis;
  const canMove = ['walking', 'waiting', 'exiting', 'completed'].includes(flow.phase) && !sceneError;

  useEffect(() => {
    if (flow.phase === 'ready') {
      sendFlow({ type: 'START' });
    }
  }, [flow.phase]);

  const handleArrive = useCallback(() => {
    sendFlow({ type: 'ARRIVED' });
    setArrivalNotice(true);
  }, []);

  const abortConversation = useCallback(() => {
    requestId.current += 1;
    requestRef.current?.controller.abort();
    requestRef.current = null;
    speechStreamRef.current?.stop();
    speechStreamRef.current = null;
    stopSpeech();
  }, []);

  useEffect(() => {
    if (!canChat) {
      abortConversation();
      return;
    }
    const controller = new AbortController();
    const id = ++requestId.current;
    setConversationStatus('checking');
    setConversationError('');
    checkChatAvailability(controller.signal).then((available) => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setConversationStatus(available ? 'input' : 'unavailable');
    });
    return () => controller.abort();
  }, [canChat, flow.phase, flow.session, abortConversation]);

  useEffect(() => {
    if (flow.phase !== 'patientSpeech') return;
    setMessages((current) => (current.length ? current : [{ role: 'assistant', content: PATIENT_OPENING }]));
    let minimumElapsed = false;
    let voiceFinished = muted;
    let advanced = false;
    const finish = () => {
      if (minimumElapsed && voiceFinished && !advanced) {
        advanced = true;
        sendFlow({ type: 'PATIENT_SPEECH_DONE' });
      }
    };
    const minimumTimer = window.setTimeout(() => {
      minimumElapsed = true;
      finish();
    }, Math.max(2200, PATIENT_OPENING.length * 160));
    const fallbackTimer = window.setTimeout(() => {
      voiceFinished = true;
      finish();
    }, Math.max(8500, PATIENT_OPENING.length * 400));
    if (!muted) {
      const started = speakChinese(PATIENT_OPENING, () => {
        voiceFinished = true;
        finish();
      }, emotionForSpeech(PATIENT_OPENING), PATIENT_VOICE_PROFILE);
      if (!started) voiceFinished = true;
    }
    finish();
    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(fallbackTimer);
      stopSpeech();
    };
  }, [flow.phase, muted]);

  const sendQuestion = async () => {
    const question = draft.trim();
    if (!question || requestRef.current || (conversationStatus !== 'input' && conversationStatus !== 'error')) return;

    abortConversation();
    const controller = new AbortController();
    const id = ++requestId.current;
    requestRef.current = { controller, id };
    setConversationStatus('thinking');
    setConversationError('');

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(nextMessages);
    setDraft('');
    let partialReply = '';
    const speechStream = mutedRef.current ? null : startSpeechStream(
      PATIENT_VOICE_PROFILE,
      () => {
        if (id === requestId.current && !controller.signal.aborted) setConversationStatus('talking');
      },
      () => {
        if (id !== requestId.current || controller.signal.aborted) return;
        speechStreamRef.current = null;
        setConversationStatus(requestRef.current ? 'replying' : 'input');
      },
    );
    speechStreamRef.current = speechStream;
    try {
      const reply = await requestReply(nextMessages, (text) => {
        if (id !== requestId.current || controller.signal.aborted) return;
        partialReply += text;
        setMessages([...nextMessages, { role: 'assistant', content: partialReply }]);
        setConversationStatus((status) => (status === 'talking' ? status : 'replying'));
        if (speechStream && speechStreamRef.current === speechStream) {
          speechStream.push(text);
        }
      }, controller.signal);
      if (id !== requestId.current || controller.signal.aborted) return;
      setMessages([...nextMessages, { role: 'assistant', content: reply }]);
      requestRef.current = null;
      if (speechStream && speechStreamRef.current === speechStream) {
        if (reply.startsWith(partialReply)) speechStream.push(reply.slice(partialReply.length));
        speechStream.finish();
      } else {
        setConversationStatus('input');
      }
    } catch (error) {
      if (controller.signal.aborted || id !== requestId.current) return;
      requestRef.current = null;
      speechStream?.stop();
      if (speechStreamRef.current === speechStream) speechStreamRef.current = null;
      setMessages(messages);
      setDraft(question);
      setConversationStatus('error');
      setConversationError(error instanceof Error ? error.message : '患者暂时无法回应，请稍后重试。');
    }
  };

  const stopReading = () => {
    speechStreamRef.current?.stop();
    speechStreamRef.current = null;
    stopSpeech();
    setConversationStatus(requestRef.current ? 'replying' : 'input');
  };

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      speechStreamRef.current?.stop();
      speechStreamRef.current = null;
      stopSpeech();
      if (conversationStatus === 'talking' || conversationStatus === 'replying') setConversationStatus(requestRef.current ? 'replying' : 'input');
    }
  };

  const resetTraining = () => {
    abortConversation();
    setMessages([]);
    setDraft('');
    setConversationError('');
    setFourDiagnosisRecords({});
    setAuxiliaryExamRecords({});
    setClinicalDiagnosisRecords({});
    setTreatmentPlan(createInitialTreatmentPlan());
    setArrivalNotice(false);
    setCanInteract(false);
    setSceneError('');
    sendFlow({ type: 'RESET' });
  };

  const retryScene = () => {
    clearModelCache();
    setSceneError('');
    setSceneAttempt((attempt) => attempt + 1);
  };

  const leaveDiagnosis = (finish: boolean) => {
    abortConversation();
    sendFlow({ type: finish ? 'FINISH' : 'BACK' });
  };

  if (isDiagnosis) {
    return (
      <DiagnosisPage
        patientView={patientView}
        doctorView={doctorView}
        messages={messages}
        draft={draft}
        status={conversationStatus}
        error={conversationError}
        onDraftChange={setDraft}
        onSend={sendQuestion}
        onStopReading={stopReading}
        onBack={() => leaveDiagnosis(false)}
        onFinish={() => leaveDiagnosis(true)}
        onReset={resetTraining}
        onBeginExam={() => sendFlow({ type: 'BEGIN_EXAM' })}
      />
    );
  }

  if (['physicalExam', 'fourDiagnosis', 'auxiliaryExam', 'clinicalDiagnosis', 'treatment'].includes(flow.phase)) {
    const module = flow.phase as 'physicalExam' | 'fourDiagnosis' | 'auxiliaryExam' | 'clinicalDiagnosis' | 'treatment';
    const records = module === 'fourDiagnosis' ? fourDiagnosisRecords : module === 'auxiliaryExam' ? auxiliaryExamRecords : module === 'clinicalDiagnosis' ? clinicalDiagnosisRecords : {};
    const onRecordChange = (id: string, value: string) => {
      if (module === 'fourDiagnosis') setFourDiagnosisRecords((prev) => ({ ...prev, [id]: value }));
      else if (module === 'auxiliaryExam') setAuxiliaryExamRecords((prev) => ({ ...prev, [id]: value }));
      else if (module === 'clinicalDiagnosis') setClinicalDiagnosisRecords((prev) => ({ ...prev, [id]: value }));
    };
    const onNext = () => {
      if (module === 'physicalExam') sendFlow({ type: 'BEGIN_FOUR_DIAGNOSIS' });
      else if (module === 'fourDiagnosis') sendFlow({ type: 'BEGIN_AUXILIARY_EXAM' });
      else if (module === 'auxiliaryExam') sendFlow({ type: 'BEGIN_CLINICAL_DIAGNOSIS' });
      else if (module === 'clinicalDiagnosis') sendFlow({ type: 'BEGIN_TREATMENT' });
      else sendFlow({ type: 'COMPLETE_CASE' });
    };
    return (
      <ClinicalModulePage
        module={module}
        onBack={() => sendFlow({ type: 'BACK' })}
        onNext={onNext}
        onReset={resetTraining}
        records={records}
        onRecordChange={onRecordChange}
        plan={module === 'treatment' ? treatmentPlan : undefined}
        onPlanChange={module === 'treatment' ? setTreatmentPlan : undefined}
      />
    );
  }

  return (
    <main className="app-shell relative flex min-h-screen flex-col overflow-hidden bg-[#e9f1f2] text-[#173d49]">
      <header className="app-header relative z-10 flex items-center justify-between border-b border-[#d4e4e6] bg-white/90 px-6 py-3 backdrop-blur">
        <div className="brand-block flex items-center gap-3">
          <span className="brand-seal grid h-10 w-10 place-items-center rounded-lg bg-[#0d4d66] text-white">
            <Stethoscope aria-hidden="true" size={20} />
          </span>
          <div className="leading-tight">
            <strong className="block text-base">大连医科大学</strong>
            <span className="text-xs text-[#70878f]">临床问诊实训</span>
          </div>
        </div>
        <div className="header-actions flex items-center gap-3">
          <span className="session-chip hidden items-center gap-2 rounded-full border border-[#d4e4e6] bg-white px-3 py-1.5 text-xs text-[#19758a] md:inline-flex">
            <ShieldCheck aria-hidden="true" size={15} /> 教学模拟环境
          </span>
          <button className="icon-text-button inline-flex items-center gap-1.5 rounded-lg border border-[#d4e4e6] bg-white px-3 py-1.5 text-sm hover:bg-[#eef6f6]" type="button" onClick={toggleMute}>
            {muted ? <VolumeX aria-hidden="true" size={17} /> : <Volume2 aria-hidden="true" size={17} />}
            {muted ? '开启语音' : '静音'}
          </button>
          {flow.phase !== 'loading' && (
            <button className="icon-text-button inline-flex items-center gap-1.5 rounded-lg border border-[#d4e4e6] bg-white px-3 py-1.5 text-sm hover:bg-[#eef6f6]" type="button" onClick={resetTraining}>
              <RotateCcw aria-hidden="true" size={16} /> {flow.phase === 'completed' ? '开始下一轮' : '重播场景'}
            </button>
          )}
        </div>
      </header>

      <div className="stage-shell relative flex-1">
        <World
          key={`${flow.session}-${sceneAttempt}`}
          phase={flow.phase}
          patientSpeaking={flow.phase === 'patientSpeech'}
          onReady={() => sendFlow({ type: 'WORLD_READY' })}
          onArrive={handleArrive}
          onDepart={() => sendFlow({ type: 'DEPARTED' })}
          onInteract={() => { setArrivalNotice(false); sendFlow({ type: 'INTERACT' }); }}
          onInteractionChange={setCanInteract}
          onError={setSceneError}
        />

        <section className={`hospital-interface pointer-events-none absolute inset-0 flex flex-col justify-between p-6 ${canMove ? 'is-playing' : ''}`}>
          <div className="scene-index pointer-events-auto absolute left-6 top-6 rounded-lg border border-[#d4e4e6] bg-white/90 px-4 py-3 backdrop-blur">
            <span className="block text-xs tracking-widest text-[#70878f]">情境实训 · 01</span>
            <strong className="block text-lg text-[#0d4d66]">{phaseLabels[flow.phase]}</strong>
          </div>

          <aside className="episode-rail pointer-events-auto absolute left-6 top-28 hidden w-56 rounded-xl border border-[#d4e4e6] bg-white/90 p-4 backdrop-blur lg:block">
            <div className="rail-heading mb-3 border-b border-[#d4e4e6] pb-2">
              <span className="text-xs tracking-widest text-[#70878f]">OUTPATIENT</span>
              <strong className="block text-base text-[#0d4d66]">门诊接诊</strong>
            </div>
            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-[#70878f]">病例</dt><dd>01</dd></div>
              <div className="flex justify-between"><dt className="text-[#70878f]">地点</dt><dd>综合门诊</dd></div>
              <div className="flex justify-between"><dt className="text-[#70878f]">目标</dt><dd>完成主诉与现病史采集</dd></div>
            </dl>
            <div className="progress-steps space-y-2">
              {['进入诊室', '听取主诉', '开始问诊'].map((label, index) => {
                const stage = ['loading', 'ready', 'walking', 'waiting'].includes(flow.phase) ? 0 : flow.phase === 'patientSpeech' ? 1 : 2;
                return (
                  <div className={`flex items-center gap-2 text-sm ${index <= stage ? 'text-[#0d4d66]' : 'text-[#70878f]'}`} key={label}>
                    <i className={`grid h-5 w-5 place-items-center rounded-full text-xs ${index <= stage ? 'bg-[#0d4d66] text-white' : 'bg-[#d4e4e6]'}`}>{index + 1}</i>
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="stage-prompt pointer-events-auto absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
            {flow.phase === 'loading' && (
              <div className="loading-card rounded-xl border border-[#d4e4e6] bg-white p-6 text-center shadow-lg">
                <span className="text-[#70878f]">正在准备实训场景</span>
                <div className="loading-track mx-auto mt-3 h-2 w-full overflow-hidden rounded-full bg-[#eef6f6]">
                  <i className="block h-full bg-[#19758a] transition-all" style={{ width: `${Math.max(8, progress)}%` }} />
                </div>
                <small className="mt-2 block text-[#70878f]">{Math.round(progress)}%</small>
              </div>
            )}
            {flow.phase === 'ready' && (
              <div className="prompt-card rounded-xl border border-[#d4e4e6] bg-white p-6 text-center shadow-lg">
                <span className="prompt-kicker text-xs tracking-widest text-[#19758a]">临床情境已就绪</span>
                <h1 className="mt-2 font-serif text-2xl font-semibold">从第一句主诉开始</h1>
                <p className="mt-2 text-sm text-[#70878f]">你是接诊医生。自由移动，待患者到达后，靠近并按 F 开始接诊。</p>
                <button className="primary-button mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0d4d66] px-5 py-2.5 text-white transition hover:bg-[#19758a]" type="button" onClick={() => sendFlow({ type: 'START' })}>进入医院</button>
              </div>
            )}
            {flow.phase === 'walking' && <div className="quiet-caption mx-auto w-fit rounded-full bg-white/90 px-4 py-2 text-sm text-[#70878f]"><i className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#19758a]" /> 患者正在前往接诊区</div>}
            {flow.phase === 'waiting' && <div className="quiet-caption mx-auto w-fit rounded-full bg-white/90 px-4 py-2 text-sm text-[#70878f]">{canInteract ? '按 F，主动开始接诊' : '患者正在等待，请靠近并面向患者'}</div>}
            {flow.phase === 'exiting' && <div className="quiet-caption mx-auto w-fit rounded-full bg-white/90 px-4 py-2 text-sm text-[#70878f]"><i className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[#19758a]" /> 患者正在离院，请保持通道畅通</div>}
            {flow.phase === 'completed' && (
              <div className="prompt-card compact-prompt rounded-xl border border-[#d4e4e6] bg-white p-6 text-center shadow-lg">
                <span className="prompt-kicker text-xs tracking-widest text-[#19758a]">本轮训练完成</span>
                <h2 className="mt-2 font-serif text-xl font-semibold">患者已离院</h2>
                <p className="mt-2 text-sm text-[#70878f]">准备好后，可以重新开始本病例的问诊训练。</p>
                <button className="primary-button mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0d4d66] px-5 py-2.5 text-white transition hover:bg-[#19758a]" type="button" onClick={resetTraining}>开始下一轮</button>
              </div>
            )}
            {flow.phase === 'patientSpeech' && <div className="subtitle-card mx-auto w-fit max-w-md rounded-xl border border-[#d4e4e6] bg-white p-5 shadow-lg"><span className="text-xs font-semibold text-[#19758a]">王旭</span><p className="mt-1 text-[#173d49]">{PATIENT_OPENING}</p></div>}
            {flow.phase === 'doctorDialog' && (
              <div className="prompt-card compact-prompt doctor-reply-card rounded-xl border border-[#d4e4e6] bg-white p-6 text-center shadow-lg">
                <span className="prompt-kicker text-xs tracking-widest text-[#19758a]">{flow.hasConsulted ? '继续问诊' : '王旭 · 患者主诉'}</span>
                <blockquote className="mt-2 border-l-4 border-[#19758a] bg-[#eef6f6] p-3 text-left text-sm italic">{flow.hasConsulted ? '根据已有问诊记录继续提问。' : PATIENT_OPENING}</blockquote>
                <button className="primary-button mt-4 inline-flex items-center gap-2 rounded-lg bg-[#0d4d66] px-5 py-2.5 text-white transition hover:bg-[#19758a]" type="button" onClick={() => sendFlow({ type: 'BEGIN_DIAGNOSIS' })}>{flow.hasConsulted ? '继续问诊' : '开始问诊'}</button>
              </div>
            )}
            {sceneError && (
              <div className="scene-error mx-auto w-fit rounded-xl border border-[#a64747] bg-white p-5 text-center shadow-lg" role="alert">
                <span className="block text-[#a64747]">{sceneError}</span>
                <button className="mt-3 rounded-lg bg-[#a64747] px-4 py-2 text-sm text-white" type="button" onClick={retryScene}>重新加载</button>
              </div>
            )}
          </div>

          {arrivalNotice && (
            <div className="arrival-notice pointer-events-auto absolute right-6 top-6 flex max-w-xs gap-3 rounded-xl border border-[#d4e4e6] bg-white p-4 shadow-lg" role="status">
              <Stethoscope size={19} aria-hidden="true" className="mt-1 flex-shrink-0 text-[#19758a]" />
              <div>
                <strong className="block text-[#0d4d66]">有病人前来就诊</strong>
                <span className="text-sm text-[#70878f]">王旭已到达接诊点，等待你主动接诊。</span>
              </div>
            </div>
          )}

          {canMove && (
            <HospitalControls
              movementInput={movementInput}
              waiting={flow.phase === 'waiting'}
              eligible={canInteract}
              resume={flow.hasConsulted}
              onInteract={() => { if (flow.phase === 'waiting') sendFlow({ type: 'INTERACT' }); }}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function HospitalControls({ movementInput, waiting, eligible, resume, onInteract }: {
  movementInput: RefObject<{ x: number; y: number }>
  waiting: boolean; eligible: boolean; resume: boolean; onInteract: () => void
}) {
  const enabled = eligible;
  const actionLabel = resume ? '继续接诊' : '接诊';
  const promptLabel = enabled ? actionLabel : '靠近并面向患者';
  const [thumb, setThumb] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const release = useCallback(() => {
    pointer.current = null;
    movementInput.current = { x: 0, y: 0 };
    setThumb({ x: 0, y: 0 });
  }, [movementInput]);

  useEffect(() => {
    const hide = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', release);
      document.removeEventListener('visibilitychange', hide);
      movementInput.current = { x: 0, y: 0 };
    };
  }, [movementInput, release]);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== pointer.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) / 34;
    const y = (rect.top + rect.height / 2 - event.clientY) / 34;
    const length = Math.hypot(x, y);
    const scale = length > 1 ? 1 / length : 1;
    const next = length < 0.14 ? { x: 0, y: 0 } : { x: x * scale, y: y * scale };
    movementInput.current = next;
    setThumb(next);
  };

  return (
    <div className="game-controls pointer-events-auto mt-auto flex items-end justify-between gap-4">
      <div className="keyboard-guide hidden rounded-lg bg-white/90 px-3 py-2 text-xs text-[#70878f] backdrop-blur md:block">
        <span><kbd className="rounded bg-[#eef6f6] px-1">W A S D</kbd> / <kbd className="rounded bg-[#eef6f6] px-1">↑ ↓ ← →</kbd> 移动</span>
        <small className="ml-2">拖动旋转视角 · 滚轮缩放</small>
      </div>
      <div
        className="touch-joystick relative grid h-24 w-24 place-items-center rounded-full border border-[#d4e4e6] bg-white/90 backdrop-blur"
        role="application"
        aria-label="医生移动摇杆"
        onPointerDown={(event) => {
          if (pointer.current !== null) return;
          event.preventDefault();
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event);
        }}
        onPointerMove={move}
        onPointerUp={(event) => { if (event.pointerId === pointer.current) release(); }}
        onPointerCancel={(event) => { if (event.pointerId === pointer.current) release(); }}
        onLostPointerCapture={release}
      >
        <span className="joystick-cross text-[#70878f]" aria-hidden="true">✣</span>
        <i className="absolute h-8 w-8 rounded-full bg-[#19758a]/20" style={{ transform: `translate(${thumb.x * 34}px, ${-thumb.y * 34}px)` }} />
        <span className="joystick-label absolute -bottom-6 text-xs text-[#70878f]">移动</span>
      </div>
      {waiting && (
        <div className={`interaction-prompt rounded-lg px-4 py-2 ${enabled ? 'bg-[#0d4d66] text-white' : 'bg-white/90 text-[#70878f]'}`}>
          <span className="keyboard-interact hidden items-center gap-2 md:inline-flex"><kbd className="rounded bg-white/20 px-1.5">F</kbd><span>{promptLabel}</span></span>
          <button type="button" className="touch-interact md:hidden" aria-label={actionLabel} disabled={!enabled} onClick={onInteract}><kbd>F</kbd>{actionLabel}</button>
        </div>
      )}
    </div>
  );
}
