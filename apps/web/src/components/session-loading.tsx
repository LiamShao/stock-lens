export function SessionLoading() {
  return (
    <main
      aria-busy="true"
      className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6"
    >
      <p className="text-sm text-slate-600">セッションを確認しています…</p>
    </main>
  );
}
