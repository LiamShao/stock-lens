'use client';

import type {
  AnalysisViewEvidence,
  AnalysisViewsResource,
  PresignedDocumentDownload,
} from '@stocklens/shared';
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { EvidenceDrawer } from './evidence-drawer';

type ViewKey = keyof AnalysisViewsResource['views'];

const VIEW_TABS: ReadonlyArray<{ key: ViewKey; label: string }> = [
  { key: 'justTellMe', label: 'Just Tell Me' },
  { key: 'analyst', label: 'Analyst View' },
  { key: 'buffettMunger', label: 'Buffett-Munger Lens' },
];

export function AnalysisViewsPanel({
  requestDocumentDownload,
  resource,
}: {
  requestDocumentDownload(
    documentId: string,
    signal: AbortSignal,
  ): Promise<PresignedDocumentDownload>;
  resource: AnalysisViewsResource;
}) {
  const [activeView, setActiveView] = useState<ViewKey>('justTellMe');
  const [selectedEvidence, setSelectedEvidence] =
    useState<AnalysisViewEvidence | null>(null);
  const evidenceById = useMemo(
    () =>
      new Map(resource.evidences.map((evidence) => [evidence.id, evidence])),
    [resource.evidences],
  );
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const baseId = useId();

  const closeEvidence = useCallback(() => {
    setSelectedEvidence(null);
    returnFocusRef.current?.focus();
  }, []);

  const openEvidence = (
    evidence: AnalysisViewEvidence,
    trigger: HTMLElement,
  ) => {
    returnFocusRef.current = trigger;
    setSelectedEvidence(evidence);
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % VIEW_TABS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + VIEW_TABS.length) % VIEW_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = VIEW_TABS.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = VIEW_TABS[nextIndex];
    if (!nextTab) return;
    setActiveView(nextTab.key);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section aria-labelledby={`${baseId}-heading`} className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold" id={`${baseId}-heading`}>
          分析ビュー
        </h2>
        <p className="text-sm text-slate-600">
          目的に合わせて三つの読み方を切り替え、各判断の根拠を確認できます。
        </p>
      </div>

      <div
        aria-label="分析ビューを選択"
        className="grid gap-2 rounded-xl bg-slate-100 p-2 sm:grid-cols-3"
        role="tablist"
      >
        {VIEW_TABS.map((tab, index) => (
          <button
            aria-controls={`${baseId}-${tab.key}-panel`}
            aria-selected={activeView === tab.key}
            className={`rounded-lg px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 sm:text-center ${
              activeView === tab.key
                ? 'bg-white text-slate-950 shadow-sm'
                : 'text-slate-600 hover:bg-white/70'
            }`}
            id={`${baseId}-${tab.key}-tab`}
            key={tab.key}
            onClick={() => setActiveView(tab.key)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            role="tab"
            tabIndex={activeView === tab.key ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {VIEW_TABS.map((tab) => {
        const view = resource.views[tab.key];
        return (
          <div
            aria-labelledby={`${baseId}-${tab.key}-tab`}
            className="space-y-8"
            hidden={activeView !== tab.key}
            id={`${baseId}-${tab.key}-panel`}
            key={tab.key}
            role="tabpanel"
            tabIndex={0}
          >
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">{tab.label}</h3>
              {tab.key === 'justTellMe' ? (
                <p className="text-sm text-slate-600">
                  会社の変化と注目点を、平易な日本語で整理します。
                </p>
              ) : null}
              {tab.key === 'analyst' ? (
                <p className="text-sm text-slate-600">
                  事業、財務、経営方針と不確実性を根拠ベースで整理します。
                </p>
              ) : null}
              {tab.key === 'buffettMunger' ? (
                <p className="text-sm text-slate-600">
                  公開されている長期価値投資原則を分析枠組みとして使用します。Buffett、Munger、Berkshire
                  Hathawayの人格模倣、推奨または承認を示すものではありません。
                </p>
              ) : null}
            </div>

            {view.sections.map((section) => (
              <section className="space-y-4" key={section.key}>
                <h4 className="border-b border-slate-200 pb-3 text-lg font-semibold">
                  {section.title}
                </h4>
                <div className="grid gap-4">
                  {section.blocks.map((block) => (
                    <article
                      className={`rounded-xl border p-5 sm:p-6 ${
                        block.isMissingInformation
                          ? 'border-amber-200 bg-amber-50'
                          : 'border-slate-200 bg-white'
                      }`}
                      key={block.key}
                    >
                      {block.isMissingInformation ? (
                        <p className="mb-3 text-sm font-semibold text-amber-800">
                          情報不足
                        </p>
                      ) : null}
                      <p className="whitespace-pre-wrap leading-7 text-slate-700">
                        {block.text}
                      </p>
                      {block.evidenceIds.length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-2" role="list">
                          {block.evidenceIds.map(
                            (evidenceId, evidenceIndex) => {
                              const evidence = evidenceById.get(evidenceId);
                              if (!evidence) return null;
                              return (
                                <span key={evidence.id} role="listitem">
                                  <button
                                    aria-label={`根拠 ${evidenceIndex + 1}を開く: ${evidence.documentName} ${evidence.pageNumber}ページ`}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
                                    onClick={(event) =>
                                      openEvidence(
                                        evidence,
                                        event.currentTarget,
                                      )
                                    }
                                    type="button"
                                  >
                                    根拠 {evidenceIndex + 1}・p.
                                    {evidence.pageNumber}
                                  </button>
                                </span>
                              );
                            },
                          )}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        );
      })}

      <aside className="rounded-xl bg-slate-100 p-5 text-sm leading-6 text-slate-600">
        本サービスは公開資料の整理を目的としており、投資助言、売買推奨、目標株価、将来リターン予測を提供しません。情報不足と表示された項目は、現在のアップロード資料だけでは判断できません。
      </aside>

      <EvidenceDrawer
        evidence={selectedEvidence}
        onClose={closeEvidence}
        requestDocumentDownload={requestDocumentDownload}
      />
    </section>
  );
}
