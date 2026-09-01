'use client';

import type {
  AnalysisViewEvidence,
  PresignedDocumentDownload,
} from '@stocklens/shared';
import { useEffect, useRef } from 'react';

import { SecurePdfViewer } from './pdf-viewer';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function EvidenceDrawer({
  evidence,
  onClose,
  requestDocumentDownload,
}: {
  evidence: AnalysisViewEvidence | null;
  onClose(): void;
  requestDocumentDownload(
    documentId: string,
    signal: AbortSignal,
  ): Promise<PresignedDocumentDownload>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!evidence) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ??
          [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [evidence, onClose]);

  if (!evidence) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 sm:p-4"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        aria-describedby="evidence-drawer-description"
        aria-labelledby="evidence-drawer-title"
        aria-modal="true"
        className="h-dvh w-full overflow-y-auto bg-white p-6 shadow-2xl sm:h-full sm:max-w-5xl sm:rounded-2xl sm:p-8"
        ref={drawerRef}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-emerald-700">Evidence</p>
            <h2 className="text-2xl font-semibold" id="evidence-drawer-title">
              根拠を確認
            </h2>
          </div>
          <button
            aria-label="根拠ドロワーを閉じる"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            閉じる
          </button>
        </div>

        <p
          className="mt-5 text-sm text-slate-600"
          id="evidence-drawer-description"
        >
          分析判断が参照したアップロード資料の原文です。
        </p>

        <dl className="mt-8 grid gap-5 rounded-xl bg-slate-100 p-5 sm:grid-cols-[7rem_1fr]">
          <dt className="text-sm font-medium text-slate-500">文書</dt>
          <dd className="break-words font-medium">{evidence.documentName}</dd>
          <dt className="text-sm font-medium text-slate-500">ページ</dt>
          <dd>{evidence.pageNumber}ページ</dd>
        </dl>

        <div className="mt-8 space-y-3">
          <h3 className="font-semibold">原文抜粋</h3>
          <blockquote className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-5 leading-7 text-slate-700">
            {evidence.excerpt}
          </blockquote>
        </div>

        <div className="mt-8">
          <SecurePdfViewer
            initialPage={evidence.pageNumber}
            key={evidence.id}
            requestDownload={(signal) =>
              requestDocumentDownload(evidence.documentId, signal)
            }
          />
        </div>
      </section>
    </div>
  );
}
