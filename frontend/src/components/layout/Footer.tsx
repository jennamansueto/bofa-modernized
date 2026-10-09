import { submittedStamp } from '@/lib/format';
import styles from './Footer.module.css';

const LINKS = ['Locations', 'Contact Us', 'Help & Support', 'Browser Requirements', 'Accessible Banking', 'Privacy', 'Security', 'Online Banking Service Agreement', 'Site Map'];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="inner">
        <ul className={styles.links}>{LINKS.map((l) => <li key={l}><span className="nav-item">{l}</span></li>)}</ul>
        <p>Bank of America, N.A. Member FDIC. Equal Housing Lender © 2026 Bank of America Corporation. All rights reserved.</p>
        <p className={styles.stamp}>OLB-XFR 4.7.12 · node olbweb01a · {submittedStamp(undefined, true)}</p>
      </div>
    </footer>
  );
}
