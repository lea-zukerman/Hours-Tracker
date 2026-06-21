import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { RepositoryProvider, useRepository } from './RepositoryContext.tsx';
import type { Repository } from '../../data/Repository.ts';

// A minimal stand-in Repository — proves injection without a real backend.
const fakeRepo = { id: 'fake' } as unknown as Repository;
const otherRepo = { id: 'other' } as unknown as Repository;

const wrapWith = (repository: Repository) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <RepositoryProvider repository={repository}>{children}</RepositoryProvider>;
  };

describe('useRepository', () => {
  it('returns the injected repository', () => {
    const { result } = renderHook(() => useRepository(), { wrapper: wrapWith(fakeRepo) });
    expect(result.current).toBe(fakeRepo);
  });

  it('swapping the injected repo needs no consumer change (DoD 3.1)', () => {
    const { result } = renderHook(() => useRepository(), { wrapper: wrapWith(otherRepo) });
    expect(result.current).toBe(otherRepo); // same hook, different repo
  });

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useRepository())).toThrow(/RepositoryProvider/);
  });
});
