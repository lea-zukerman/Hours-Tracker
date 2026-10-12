import type { ReactNode } from 'react';
import { Card } from '../../ui/Card.tsx';
import { BRAND, LEGAL_UPDATED } from './contact.ts';
import { LegalFooter } from './LegalFooter.tsx';

/** Shared frame for the public legal pages. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="app-shell legal">
      <p className="legal__brand">
        <a href="/">⏱ {BRAND}</a>
      </p>
      <Card title={title}>
        <div className="legal__body">
          {children}
          <p className="auth-hint">עודכן לאחרונה: {LEGAL_UPDATED}</p>
        </div>
      </Card>
      <LegalFooter />
    </main>
  );
}
