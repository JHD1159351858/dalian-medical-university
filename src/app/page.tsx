'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, ChartNoAxesCombined, ShieldCheck, Stethoscope } from 'lucide-react';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();

  return (
    <main className="town-home relative min-h-screen overflow-hidden text-[#173d49]">
      <div className="absolute inset-0 -z-10">
        <Image
          src="/home-background.png"
          alt="医院小镇"
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#e9f1f2]/90 via-[#e9f1f2]/60 to-transparent" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 md:px-12">
        <div className="brand-block flex items-center gap-3">
          <span className="brand-seal grid h-11 w-11 place-items-center rounded-lg bg-[#0d4d66] text-white">
            <Stethoscope size={22} aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <strong className="block text-lg">大连医科大学</strong>
            <span className="text-sm text-[#70878f]">临床问诊实训</span>
          </div>
        </div>
        <span className="session-chip hidden items-center gap-2 rounded-full border border-[#d4e4e6] bg-white/80 px-3 py-1.5 text-sm text-[#19758a] md:inline-flex">
          <ShieldCheck size={15} aria-hidden="true" /> 教学模拟环境
        </span>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-12 md:grid-cols-2 md:px-12 md:pt-20">
        <div className="town-hero-copy">
          <span className="town-eyebrow text-xs font-semibold tracking-[0.2em] text-[#19758a]">
            DALIAN MEDICAL UNIVERSITY
          </span>
          <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.15] tracking-wide md:text-6xl">
            走进医院
            <br />
            成为<span className="text-[#19758a]">接诊医生</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-[#70878f]">
            从第一句主诉，到一次完整的问诊。
          </p>
          <div className="town-features mt-10 grid gap-4">
            <div className="flex items-center gap-4 rounded-xl bg-white/80 p-4 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#dceff1] text-[#19758a]">
                <Stethoscope size={24} aria-hidden="true" />
              </span>
              <p className="leading-tight">
                <strong className="block">临床思维训练</strong>
                <small className="text-[#70878f]">规范 · 系统 · 实践</small>
              </p>
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-white/80 p-4 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#dceff1] text-[#19758a]">
                <BookOpen size={24} aria-hidden="true" />
              </span>
              <p className="leading-tight">
                <strong className="block">典型案例库</strong>
                <small className="text-[#70878f]">真实 · 多源 · 更新</small>
              </p>
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-white/80 p-4 shadow-sm">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#dceff1] text-[#19758a]">
                <ChartNoAxesCombined size={24} aria-hidden="true" />
              </span>
              <p className="leading-tight">
                <strong className="block">能力评估反馈</strong>
                <small className="text-[#70878f]">可视 · 量化 · 提升</small>
              </p>
            </div>
          </div>
        </div>

        <aside className="hidden flex-col items-end justify-center gap-6 md:flex">
          <div className="rounded-2xl border border-[#d4e4e6] bg-white/80 p-8 text-right shadow-lg backdrop-blur-sm">
            <strong className="font-serif text-3xl leading-snug text-[#0d4d66]">
              厚德尚医
              <br />
              笃行致远
            </strong>
            <div className="mt-6 text-xs font-semibold tracking-[0.15em] text-[#70878f]">
              VIRTUE
              <br />
              MEDICINE
              <br />
              PRACTICE
              <br />
              FUTURE
            </div>
          </div>
        </aside>
      </section>

      <section className="fixed bottom-0 left-0 right-0 z-20 border-t border-[#d4e4e6] bg-white/90 px-6 py-5 backdrop-blur md:px-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
          <div>
            <h2 className="text-lg font-semibold text-[#173d49]">走进医院，成为接诊医生。</h2>
            <p className="text-sm text-[#70878f]">从第一句主诉，到一次完整的问诊。</p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0d4d66] px-6 py-3 text-white shadow-md transition hover:bg-[#19758a]"
            onClick={() => router.push('/training')}
          >
            开始实训 <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      </section>
    </main>
  );
}
