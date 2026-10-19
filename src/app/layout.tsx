import type { Metadata } from 'next';
import Script from 'next/script';

import { IframeSdkProvider } from '@/components/iframe-sdk-provider';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '临床问诊实训 · 大连医科大学',
    template: '%s · 临床问诊实训 · 大连医科大学',
  },
  description:
    '大连医科大学临床问诊实训：与数字患者开展标准化问诊。',
  keywords: ['临床问诊', '医学实训', '标准化病人', '大连医科大学'],
  generator: 'NoahCoder',
  openGraph: {
    title: '临床问诊实训 · 大连医科大学',
    description:
      '走进医院，成为接诊医生。从第一句主诉，到一次完整的问诊。',
    url: '',
    siteName: '临床问诊实训 · 大连医科大学',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {/**
          iframe-route-sync：子页面路由 ↔ 父页面地址双向同步
          iframe-error-sync：子页面 dev 错误上报到父页面调试面板
          iframe-element-picker：子页面元素选取能力
          beforeInteractive 策略确保应用代码执行前 SDK 已就绪。
        */}
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-route-sync/child.umd.js?v=1792389337447"
          strategy="beforeInteractive"
        />
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-error-sync/child.umd.js?v=1792389337447"
          strategy="beforeInteractive"
        />
        <Script
          src="https://robot.chaoxing.com/coder-sdk/iframe-element-picker/child.umd.js?v=1792389337447"
          strategy="beforeInteractive"
        />
        {/**
          error-sync 初始化：必须同样使用 beforeInteractive 交给 Next 运行时串行加载。
          App Router 下 beforeInteractive 由 app-bootstrap 依次创建 <script> 并等待加载
          完成后才水合，因此这里能拿到已就绪的 SDK；若写成原生 <script>，它会在 HTML
          解析阶段立即执行，此时 SDK 尚未加载，会抛
          ReferenceError: IframeErrorSync is not defined。
        */}
        <Script
          id="coder-iframe-error-sync-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `window.__errorBridge = window.IframeErrorSync && window.IframeErrorSync.child.create({ debug: false, reporters: 'auto' }).init();`,
          }}
        />
        <IframeSdkProvider>{children}</IframeSdkProvider>
      </body>
    </html>
  );
}
