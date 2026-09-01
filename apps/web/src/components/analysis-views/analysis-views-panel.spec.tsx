import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createAnalysisViewsFixture } from '@/test/analysis-views-fixture';

import { AnalysisViewsPanel } from './analysis-views-panel';

const requestDocumentDownload = async () => ({
  expiresAt: '2026-09-01T00:05:00.000Z',
  url: 'https://storage.example.test/document.pdf?signature=secret',
});

describe('AnalysisViewsPanel VIEW-AC-011/012', () => {
  it('switches all three view tabs with keyboard semantics and shows framework disclaimers', () => {
    render(
      <AnalysisViewsPanel
        requestDocumentDownload={requestDocumentDownload}
        resource={createAnalysisViewsFixture()}
      />,
    );

    const justTellMe = screen.getByRole('tab', { name: 'Just Tell Me' });
    const analyst = screen.getByRole('tab', { name: 'Analyst View' });
    const buffettMunger = screen.getByRole('tab', {
      name: 'Buffett-Munger Lens',
    });
    justTellMe.focus();

    fireEvent.keyDown(justTellMe, { key: 'ArrowRight' });
    expect(analyst).toHaveAttribute('aria-selected', 'true');
    expect(analyst).toHaveFocus();
    expect(
      within(screen.getByRole('tabpanel')).getByRole('heading', {
        name: '財務ハイライト',
      }),
    ).toBeInTheDocument();

    fireEvent.keyDown(analyst, { key: 'End' });
    expect(buffettMunger).toHaveAttribute('aria-selected', 'true');
    expect(buffettMunger).toHaveFocus();
    expect(screen.getByText(/人格模倣、推奨または承認/)).toBeInTheDocument();

    fireEvent.keyDown(buffettMunger, { key: 'Home' });
    expect(justTellMe).toHaveAttribute('aria-selected', 'true');
  });

  it('renders missing information explicitly and opens plain-text evidence in a modal drawer', () => {
    render(
      <AnalysisViewsPanel
        requestDocumentDownload={requestDocumentDownload}
        resource={createAnalysisViewsFixture()}
      />,
    );

    expect(
      within(screen.getByRole('tabpanel')).getByText('情報不足'),
    ).toBeInTheDocument();
    const trigger = screen.getAllByRole('button', {
      name: /根拠 1を開く/,
    })[0];
    expect(trigger).toBeDefined();
    trigger?.focus();
    fireEvent.click(trigger as HTMLButtonElement);

    const dialog = screen.getByRole('dialog', { name: '根拠を確認' });
    expect(within(dialog).getByText('12ページ')).toBeInTheDocument();
    expect(
      within(dialog).getByText('2026年3月期 決算説明資料.pdf'),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/<script>alert\("ignored"\)<\/script>/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', {
        name: '12ページをPDFで開く',
      }),
    ).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();

    const close = within(dialog).getByRole('button', {
      name: '根拠ドロワーを閉じる',
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
