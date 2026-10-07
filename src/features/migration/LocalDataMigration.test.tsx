import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { LocalDataMigration } from './LocalDataMigration.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';
import { makeEntry } from '../../test/fixtures.ts';

async function setup() {
  const local = new LocalStorageRepository(memoryStorage());
  await local.upsertEntry(makeEntry({ id: 'e1', date: '2026-06-01' }));
  const cloud = new LocalStorageRepository(memoryStorage());
  render(<LocalDataMigration local={local} />, { wrapper: createWrapper(cloud) });
  return { local, cloud };
}

describe('LocalDataMigration', () => {
  it('offers to move browser data into an empty account and does it', async () => {
    const { local, cloud } = await setup();
    expect(await screen.findByText(/נמצאו 1 ימי דיווח ו-0 היעדרויות/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'העברה לחשבון' }));
    expect(await screen.findByRole('status')).toHaveTextContent('הועברו 1 ימי דיווח');
    expect((await cloud.exportAll()).entries).toHaveLength(1);
    expect((await local.exportAll()).entries).toEqual([]);
  });

  it('can be declined, and stays declined', async () => {
    const { local } = await setup();
    fireEvent.click(await screen.findByRole('button', { name: 'לא, תודה' }));
    expect(screen.queryByRole('button', { name: 'העברה לחשבון' })).not.toBeInTheDocument();
    expect(local.isMigrationDismissed()).toBe(true);
  });

  it('shows a retryable error and keeps browser data when the move fails', async () => {
    const { local, cloud } = await setup();
    vi.spyOn(cloud, 'importAll').mockRejectedValueOnce(new Error('Supabase: down'));
    fireEvent.click(await screen.findByRole('button', { name: 'העברה לחשבון' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ההעברה נכשלה');
    expect((await local.exportAll()).entries).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'ניסיון נוסף' }));
    expect(await screen.findByRole('status')).toHaveTextContent('הועברו 1 ימי דיווח');
  });

  it('does not offer when the account already has data', async () => {
    const local = new LocalStorageRepository(memoryStorage());
    await local.upsertEntry(makeEntry({ id: 'e1' }));
    const cloud = new LocalStorageRepository(memoryStorage());
    await cloud.upsertEntry(makeEntry({ id: 'c1' }));
    const { container } = render(<LocalDataMigration local={local} />, {
      wrapper: createWrapper(cloud),
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });
});
