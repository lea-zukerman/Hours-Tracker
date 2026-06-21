import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card } from './Card.tsx';
import { Button } from './Button.tsx';
import { ProgressRing } from './ProgressRing.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import { BalanceBadge } from './BalanceBadge.tsx';

describe('Card', () => {
  it('renders a title and children', () => {
    render(<Card title="היום">תוכן</Card>);
    expect(screen.getByRole('heading', { name: 'היום' })).toBeInTheDocument();
    expect(screen.getByText('תוכן')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('renders, defaults to type=button, and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>שמור</Button>);
    const btn = screen.getByRole('button', { name: 'שמור' });
    expect(btn).toHaveAttribute('type', 'button');
    expect(btn).toHaveClass('ht-btn--primary');
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is keyboard-focusable', () => {
    render(<Button>פעולה</Button>);
    const btn = screen.getByRole('button');
    btn.focus();
    expect(btn).toHaveFocus();
  });

  it('applies the variant class', () => {
    render(<Button variant="danger">מחק</Button>);
    expect(screen.getByRole('button')).toHaveClass('ht-btn--danger');
  });
});

describe('ProgressRing', () => {
  it('exposes a progressbar with the rounded percentage', () => {
    render(<ProgressRing value={0.5} label="התקדמות" />);
    const bar = screen.getByRole('progressbar', { name: 'התקדמות' });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
  });

  it('clamps out-of-range values', () => {
    render(<ProgressRing value={1.8} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('renders center content', () => {
    render(
      <ProgressRing value={0.3}>
        <span>8:00</span>
      </ProgressRing>,
    );
    expect(screen.getByText('8:00')).toBeInTheDocument();
  });
});

describe('ProgressBar', () => {
  it('exposes a progressbar with the percentage', () => {
    render(<ProgressBar value={0.25} label="חודש" />);
    expect(screen.getByRole('progressbar', { name: 'חודש' })).toHaveAttribute('aria-valuenow', '25');
  });
});

describe('BalanceBadge', () => {
  it('shows a positive balance with a + sign and positive tone', () => {
    render(<BalanceBadge minutes={80} />);
    expect(screen.getByText('+1:20')).toBeInTheDocument();
    expect(screen.getByText('+1:20').closest('.ht-badge')).toHaveClass('ht-badge--positive');
  });

  it('shows a deficit with negative tone', () => {
    render(<BalanceBadge minutes={-90} />);
    expect(screen.getByText('-1:30').closest('.ht-badge')).toHaveClass('ht-badge--negative');
  });

  it('shows zero with the even tone', () => {
    render(<BalanceBadge minutes={0} />);
    expect(screen.getByText('0:00').closest('.ht-badge')).toHaveClass('ht-badge--zero');
  });
});
