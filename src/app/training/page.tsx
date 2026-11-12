'use client';

import dynamic from 'next/dynamic';

const Training = dynamic(() => import('@/App'), {
  ssr: false,
  loading: () => <div className="training-loading" role="status">正在准备实训场景…</div>,
});

export default function TrainingPage() {
  return <Training autoStart />;
}
