import { useSearchParams } from 'react-router-dom';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { CookieNotice } from '@/features/landing/CookieNotice';
import { CardOffers } from '@/features/landing/CardOffers';
import { SignInPanel } from '@/features/landing/SignInPanel';
import { TITLES } from '@/lib/messages';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

export function LandingPage() {
  useDocumentTitle(TITLES.landing);
  const [params] = useSearchParams();
  const expired = params.get('expired') === '1';
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <CookieNotice />
      <PublicHeader />
      <main id="main" tabIndex={-1}>
        <div className="hero landing-hero">
          <div className="inner landing-inner">
            <div className="landing-left">
              <SignInPanel expired={expired} />
              <div className="openacct">
                <img src="/images/dollar.png" alt="" width={24} height={24} />
                <span className="nav-item">Open an account</span>
              </div>
            </div>
            <CardOffers />
          </div>
        </div>
      </main>
    </>
  );
}
