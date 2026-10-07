# auth/

Authentication boundary (spec §3.2). `AuthService.ts` is the interface the UI
uses; `SupabaseAuthService.ts` implements it over Supabase Auth; `AuthContext.tsx`
turns it into React state (`loading` / `signed_out` / `mfa_required` / `signed_in`).
Tests use `src/test/fakeAuth.ts`.
