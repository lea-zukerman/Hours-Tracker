import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPage } from './SettingsPage.tsx';
import { LocalStorageRepository } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';

describe('SettingsPage', () => {
  it('persists an edited setting', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    render(<SettingsPage />, { wrapper: createWrapper(repo) });

    // Form loads from settings async — wait for the field, then edit + save.
    fireEvent.change(await screen.findByLabelText('אחוז משרה'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('שמור הגדרות'));

    await waitFor(async () => {
      const settings = await repo.getSettings();
      expect(settings.jobPercent).toBe(50);
    });
  });
});
