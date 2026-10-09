import { Link } from 'react-router-dom';

export function BrandLogo({ to, variant }: { to: string; variant: 'public' | 'olb' }) {
  const flag = <img src="/images/flag.png" alt="" width={variant === 'olb' ? 44 : 56} height={variant === 'olb' ? 27 : 34} className="logo-flag" />;
  return (
    <Link to={to} className={`logo logo-${variant}`} aria-label="Bank of America home">
      {variant === 'olb' && flag}
      <span className="logo-text">BANK OF AMERICA</span>
      {variant === 'public' && flag}
    </Link>
  );
}

/** Legacy href="#" links: kept as visible text for look-parity, but not focusable dead links (A7). */
export function NavText({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`nav-item ${className}`}>{children}</span>;
}
