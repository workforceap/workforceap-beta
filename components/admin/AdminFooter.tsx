export default function AdminFooter() {
  return (
    <footer
      className="admin-footer"
      style={{
        borderTop: '1px solid var(--outline-variant)',
        padding: '0.75rem 1.5rem',
        marginTop: 'auto',
        fontSize: '0.8125rem',
        color: 'var(--color-on-surface-variant)',
        background: 'var(--surface-container-lowest)',
      }}
    >
      © {new Date().getFullYear()} Workforce Advancement Project
      <span style={{ margin: '0 0.35rem', color: 'var(--outline-variant)' }}>|</span>
      Support:{' '}
      <a href="mailto:info@workforceap.org" style={{ color: 'var(--wa-info-dark)', textDecoration: 'none' }}>
        info@workforceap.org
      </a>
    </footer>
  );
}
