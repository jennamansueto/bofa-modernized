import { useState } from 'react';
import { BrandLogo, NavText } from './Brand';
import { PRODUCTS, SEGMENTS } from './nav';
import styles from './Header.module.css';

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header>
      <div className={styles.fdicbar}>
        <div className="inner">
          <span className={styles.deposits}>Bank of America deposit products:</span>
          <img src="/images/fdic.png" alt="FDIC" width={60} height={20} className={styles.fdicImg} />
          <b>FDIC-Insured - Backed by the full faith and credit of the U.S. Government</b>
        </div>
      </div>
      <nav aria-label="Site" className={`${styles.utilnav} ${menuOpen ? styles.open : ''}`} id="site-menu">
        <div className={`inner ${styles.utilInner}`}>
          <ul className={styles.segments}>
            {SEGMENTS.map((s, i) => (
              <li key={s}><NavText className={i === 0 ? styles.sel : ''}>{s}</NavText></li>
            ))}
          </ul>
          <ul className={styles.util}>
            <li><NavText>Security</NavText></li>
            <li><NavText>About Us</NavText></li>
            <li className={styles.sep} aria-hidden="true">|</li>
            <li><NavText><img src="/images/globe.png" alt="" width={22} height={22} className={styles.globe} />En español</NavText></li>
            <li className={styles.sep} aria-hidden="true">|</li>
            <li><NavText>Contact Us</NavText></li>
            <li className={styles.sep} aria-hidden="true">|</li>
            <li><NavText>Help</NavText></li>
          </ul>
        </div>
      </nav>
      <div className={styles.logorow}>
        <div className={`inner ${styles.logoInner}`}>
          <BrandLogo to="/" variant="public" />
          <form role="search" className={styles.searchbox} onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="site-search" className="visually-hidden">Search</label>
            <input id="site-search" name="q" type="search" placeholder="Search" />
            <button type="submit"><img src="/images/search.png" alt="Search" width={20} height={20} /></button>
          </form>
          <button
            type="button"
            className={styles.menuBtn}
            aria-expanded={menuOpen}
            aria-controls="site-menu product-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className={styles.burger} aria-hidden="true" />
            <span className="visually-hidden">Menu</span>
          </button>
        </div>
      </div>
      <nav aria-label="Products" className={`${styles.prodnav} ${menuOpen ? styles.open : ''}`} id="product-menu">
        <ul className="inner">
          {PRODUCTS.map((p) => (
            <li key={p}><NavText>{p}<img src="/images/chevron.png" alt="" width={12} height={8} className={styles.chevron} /></NavText></li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
