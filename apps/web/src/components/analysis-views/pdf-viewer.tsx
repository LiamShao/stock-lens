'use client';

import type { PresignedDocumentDownload } from '@stocklens/shared';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';

import {
  fetchPdfBytes,
  loadPdfDocument,
  PdfDocumentError,
  type LoadedPdfDocument,
} from '@/lib/pdf-document';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { bytes: Uint8Array; status: 'ready' }
  | { message: string; status: 'error' };

export function SecurePdfViewer({
  initialPage,
  requestDownload,
}: {
  initialPage: number;
  requestDownload(signal: AbortSignal): Promise<PresignedDocumentDownload>;
}) {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const activeRequestRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      activeRequestRef.current?.abort();
    },
    [],
  );

  const openPdf = async () => {
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setLoadState({ status: 'loading' });
    try {
      const download = await requestDownload(controller.signal);
      const bytes = await fetchPdfBytes(download.url, controller.signal);
      if (!controller.signal.aborted) setLoadState({ bytes, status: 'ready' });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message =
        error instanceof PdfDocumentError
          ? error.message
          : 'PDFを表示できませんでした。時間をおいて再度お試しください。';
      setLoadState({ message, status: 'error' });
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
    }
  };

  if (loadState.status === 'ready') {
    return <PdfCanvasViewer data={loadState.bytes} initialPage={initialPage} />;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
      <h3 className="font-semibold">PDFで原文を確認</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        操作したときだけ短時間有効な読み取りURLを発行し、該当ページを安全なCanvas表示で開きます。
      </p>
      {loadState.status === 'error' ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {loadState.message}
        </p>
      ) : null}
      <button
        className="mt-4 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-wait disabled:bg-slate-400"
        disabled={loadState.status === 'loading'}
        onClick={() => void openPdf()}
        type="button"
      >
        {loadState.status === 'loading'
          ? 'PDFを読み込んでいます…'
          : loadState.status === 'error'
            ? 'PDFを再読み込み'
            : `${initialPage}ページをPDFで開く`}
      </button>
    </div>
  );
}

function PdfCanvasViewer({
  data,
  initialPage,
}: {
  data: Uint8Array;
  initialPage: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const loadedDocumentRef = useRef<LoadedPdfDocument | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [documentState, setDocumentState] = useState<
    | { status: 'loading' }
    | { pageCount: number; status: 'ready' }
    | { message: string; status: 'error' }
  >({ status: 'loading' });
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let disposed = false;
    void loadPdfDocument(data)
      .then(async (loadedDocument) => {
        if (disposed) {
          await loadedDocument.destroy();
          return;
        }
        loadedDocumentRef.current = loadedDocument;
        const document = loadedDocument.document;
        documentRef.current = document;
        if (initialPage > document.numPages) {
          await loadedDocument.destroy();
          loadedDocumentRef.current = null;
          documentRef.current = null;
          setDocumentState({
            message: '指定されたPDFページを表示できません。',
            status: 'error',
          });
          return;
        }
        setDocumentState({ pageCount: document.numPages, status: 'ready' });
      })
      .catch(() => {
        if (!disposed) {
          setDocumentState({
            message:
              'PDFを表示できませんでした。時間をおいて再度お試しください。',
            status: 'error',
          });
        }
      });

    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      documentRef.current = null;
      const loadedDocument = loadedDocumentRef.current;
      loadedDocumentRef.current = null;
      if (loadedDocument) void loadedDocument.destroy();
    };
  }, [data, initialPage]);

  useEffect(() => {
    if (documentState.status !== 'ready') return;
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas) return;

    let disposed = false;
    setIsRendering(true);
    void document
      .getPage(currentPage)
      .then(async (page) => {
        if (disposed) return;
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
        const renderTask = page.render({
          annotationMode: 0,
          canvas,
          viewport,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        page.cleanup();
      })
      .then(() => {
        if (!disposed) setIsRendering(false);
      })
      .catch(() => {
        if (!disposed) {
          setIsRendering(false);
          setDocumentState({
            message: 'PDFページを表示できませんでした。',
            status: 'error',
          });
        }
      });

    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [currentPage, documentState.status]);

  if (documentState.status === 'loading') {
    return (
      <p aria-live="polite" className="text-sm text-slate-600">
        PDFを解析しています…
      </p>
    );
  }
  if (documentState.status === 'error') {
    return (
      <p className="text-sm text-red-700" role="alert">
        {documentState.message}
      </p>
    );
  }

  return (
    <section aria-label="PDFビューア" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-100 p-3">
        <p aria-live="polite" className="text-sm font-medium">
          {currentPage} / {documentState.pageCount}ページ
          {isRendering ? '（描画中）' : ''}
        </p>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={currentPage <= 1 || isRendering}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            type="button"
          >
            前のページ
          </button>
          <button
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-slate-400"
            disabled={currentPage >= documentState.pageCount || isRendering}
            onClick={() =>
              setCurrentPage((page) =>
                Math.min(documentState.pageCount, page + 1),
              )
            }
            type="button"
          >
            次のページ
          </button>
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-300 bg-slate-200 p-2 sm:p-4">
        <canvas
          aria-label={`PDF ${currentPage}ページ`}
          className="mx-auto h-auto max-w-full bg-white shadow"
          ref={canvasRef}
          role="img"
        />
      </div>
      <p className="text-xs leading-5 text-slate-500">
        PDF内のリンク、添付ファイル、JavaScriptなどの操作要素は有効化せず、ページ画像だけを表示します。
      </p>
    </section>
  );
}
