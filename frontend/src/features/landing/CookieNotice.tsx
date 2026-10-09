import { useState } from 'react';

const KEY = 'olb.cookieNoticeDismissed';

function isDismissed() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Legacy #cookie banner; now a labelled region early in the DOM with a real close button, dismissal persisted (A5/A10). */
export function CookieNotice() {
  const [open, setOpen] = useState(() => !isDismissed());
  if (!open) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* storage unavailable */
    }
    setOpen(false);
  };
  return (
    <section className="cookie" aria-label="Cookie notice">
      <p>
        We use cookies and other tracking technologies to collect data for advertising, fraud prevention, analytics, and
        <br className="br-wide" /> other purposes. By using this website, you agree to the use of these tracking technologies and to the use and
        <br className="br-wide" /> disclosure of data in accordance with our <b className="nav-item cookie-link">Privacy Notices</b>
      </p>
      <button type="button" className="cookie-close" aria-label="Close cookie notice" onClick={dismiss}>
        <img src="/images/close.png" alt="" width={16} height={16} />
      </button>
    </section>
  );
}
