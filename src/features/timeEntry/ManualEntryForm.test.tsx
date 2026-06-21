import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManualEntryForm } from './ManualEntryForm.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry } from '../../test/fixtures.ts';

const ZONE = 'Asia/Jerusalem';
const DATE = '2026-06-10'; // a past Wednesday — not "future"

describe('ManualEntryForm', () => {
  it('creates a shift entry on save', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<ManualEntryForm date={DATE} zone={ZONE} />, { wrapper: createWrapper(repo) });

    // Settings load async — wait for the form's inputs to appear.
    fireEvent.change(await screen.findByLabelText('כניסה'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('יציאה'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByText('שמור'));

    await waitFor(async () => {
      const entries = await repo.listEntries({ from: DATE, to: DATE });
      expect(entries).toHaveLength(1);
      expect(entries[0].shifts).toHaveLength(1);
    });
  });

  it('shows a Hebrew error and blocks save when the break exceeds presence', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<ManualEntryForm date={DATE} zone={ZONE} />, { wrapper: createWrapper(repo) });

    fireEvent.change(await screen.findByLabelText('כניסה'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('יציאה'), { target: { value: '10:00' } }); // 60 min
    fireEvent.change(screen.getByLabelText('הפסקה (דקות)'), { target: { value: '120' } });

    expect(await screen.findByText('ההפסקה ארוכה מזמן הנוכחות')).toBeInTheDocument();
    expect(screen.getByText('שמור')).toBeDisabled();
  });

  it('prefills an existing day and deletes it', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    await repo.upsertEntry(makeEntry({ id: 'e1', date: DATE, manualMinutes: 480 }));

    render(<ManualEntryForm date={DATE} zone={ZONE} />, { wrapper: createWrapper(repo) });

    // existing entry → a Delete button appears
    fireEvent.click(await screen.findByText('מחק'));

    await waitFor(async () => {
      const entries = await repo.listEntries({ from: DATE, to: DATE });
      expect(entries).toHaveLength(0);
    });
  });
});
