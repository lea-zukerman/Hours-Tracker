import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReportAbsenceForm } from './ReportAbsenceForm.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeAbsence } from '../../domain/__tests__/fixtures.ts';

const DATE = '2026-06-10';
const MONTH = '2026-06';

describe('ReportAbsenceForm', () => {
  it('reports a vacation on save', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<ReportAbsenceForm date={DATE} month={MONTH} />, { wrapper: createWrapper(repo) });

    fireEvent.click(screen.getByText('שמור'));

    await waitFor(async () => {
      const absences = await repo.listAbsences({ from: '2026-06-01', to: '2026-06-30' });
      expect(absences).toHaveLength(1);
      expect(absences[0].type).toBe('vacation');
    });
  });

  it('blocks save when the end date precedes the start date', () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<ReportAbsenceForm date={DATE} month={MONTH} />, { wrapper: createWrapper(repo) });

    fireEvent.change(screen.getByLabelText('עד תאריך'), { target: { value: '2026-06-05' } });

    expect(screen.getByText('תאריך הסיום מוקדם מתאריך ההתחלה')).toBeInTheDocument();
    expect(screen.getByText('שמור')).toBeDisabled();
  });

  it('lists existing absences and deletes them', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    await repo.upsertAbsence(
      makeAbsence({ id: 'a1', type: 'sick', dateFrom: DATE, dateTo: DATE }),
    );

    render(<ReportAbsenceForm date={DATE} month={MONTH} />, { wrapper: createWrapper(repo) });

    fireEvent.click(await screen.findByLabelText('מחק היעדרות'));

    await waitFor(async () => {
      const absences = await repo.listAbsences({ from: '2026-06-01', to: '2026-06-30' });
      expect(absences).toHaveLength(0);
    });
  });
});
