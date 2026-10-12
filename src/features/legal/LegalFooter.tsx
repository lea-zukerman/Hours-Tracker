/** Legal links on every page. Plain links (full page loads) so it needs no router. */
export function LegalFooter() {
  return (
    <footer className="legal-footer">
      <nav aria-label="מידע משפטי">
        <a href="/terms">תקנון</a>
        <a href="/privacy">מדיניות פרטיות</a>
        <a href="/accessibility">הצהרת נגישות</a>
      </nav>
    </footer>
  );
}
