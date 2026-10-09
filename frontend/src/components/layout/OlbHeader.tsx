import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo, NavText } from './Brand';
import { PRODUCTS, SEGMENTS } from './nav';
import styles from './Header.module.css';

interface Props {
  firstName?: string;
  onLogout?: () => void;
  loggingOut?: boolean;
}

export function OlbHeader({ firstName, onLogout, loggingOut }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const authed = !!firstName;
  return (
    <header>
      <div className={styles.olbtop}>Bank of America, N.A. Member FDIC. Equal Housing Lender</div>
      <nav aria-label="Site" className={`${styles.utilnav} ${styles.olbutil} ${menuOpen ? styles.open : ''}`} id="olb-site-menu">
        <div className={`inner ${styles.utilInner}`}>
          <ul className={styles.segments}>{SEGMENTS.map((s) => <li key={s}><NavText>{s}</NavText></li>)}</ul>
          <ul className={styles.util}>
            {['Security', 'About Us', 'En español', 'Contact Us', 'Help'].map((s) => <li key={s}><NavText>{s}</NavText></li>)}
          </ul>
        </div>
      </nav>
      <div className={styles.olbbar}>
        <div className={`inner ${styles.olbInner}`}>
          <BrandLogo to={authed ? '/transfers' : '/'} variant="olb" />
          <nav aria-label="Products" className={`${styles.pnav} ${menuOpen ? styles.open : ''}`} id="olb-product-menu">
            <ul>{PRODUCTS.map((p) => <li key={p}><NavText>{p}</NavText></li>)}</ul>
          </nav>
          <div className={styles.actions}>
            <span className={`pill pill-search ${styles.searchPill}`}>
              <img src="/images/search.png" alt="" width={20} height={20} />Search
            </span>
            {authed ? (
              <>
                <span className={styles.welcome}>Welcome, {firstName}</span>
                <button type="button" className="pill pill-fill" onClick={onLogout} aria-busy={loggingOut || undefined}>
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/" className="pill pill-fill">Log in</Link>
                <span className={`pill pill-line ${styles.enroll}`}>Enroll</span>
              </>
            )}
            <button
              type="button"
              className={styles.menuBtn}
              aria-expanded={menuOpen}
              aria-controls="olb-site-menu olb-product-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className={styles.burger} aria-hidden="true" />
              <span className="visually-hidden">Menu</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
