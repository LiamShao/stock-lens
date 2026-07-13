import { StatusBadge } from '@stocklens/ui';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-6 px-6 py-16">
      <StatusBadge>Phase 1 foundation</StatusBadge>
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">StockLens AI</h1>
        <p className="max-w-2xl text-lg leading-8 text-slate-600">
          日本企業の公開IR資料を、ページ単位の根拠とともに読み解くための
          リサーチツールです。
        </p>
      </div>
      <p className="text-sm text-slate-500">
        本サービスは投資助言、売買推奨、目標株価を提供しません。
      </p>
    </main>
  );
}
