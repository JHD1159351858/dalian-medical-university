'use client';

import dynamic from 'next/dynamic';

const TownHome = dynamic(() => import('@/home/TownHome'), {
  ssr: false,
  loading: () => <div className="training-loading" role="status">正在载入医院小镇…</div>,
});

export default function Home() {
  return <TownHome />;
}
