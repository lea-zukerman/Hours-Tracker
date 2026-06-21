import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSettings } from './useSettings.ts';
import { LocalStorageRepository, defaultSettings } from '../../data/LocalStorageRepository.ts';
import { createWrapper } from '../../test/providers.tsx';
import { memoryStorage } from '../../test/memoryStorage.ts';

describe('useSettings', () => {
  it('reads default settings on first run', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const { result } = renderHook(() => useSettings(), { wrapper: createWrapper(repo) });

    await waitFor(() => expect(result.current.settings).toBeDefined());
    expect(result.current.settings).toEqual(defaultSettings());
  });

  it('persists saved settings and reflects them on next read', async () => {
    const repo = new LocalStorageRepository(memoryStorage());
    const { result } = renderHook(() => useSettings(), { wrapper: createWrapper(repo) });

    await waitFor(() => expect(result.current.settings).toBeDefined());

    const updated = { ...defaultSettings(), jobPercent: 60 };
    await result.current.saveSettings(updated);

    await waitFor(() => expect(result.current.settings?.jobPercent).toBe(60));
    // And it really hit storage:
    expect((await repo.getSettings()).jobPercent).toBe(60);
  });
});
