import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('HomePage', () => {
  it('renders the product name and compliance notice', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', { name: 'StockLens AI' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/投資助言/)).toBeInTheDocument();
  });
});
