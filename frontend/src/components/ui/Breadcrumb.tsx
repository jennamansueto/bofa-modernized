import { Link } from 'react-router-dom';
import { Fragment } from 'react';

export function Breadcrumb({ items, current }: { items: { label: string; to: string }[]; current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="inner crumbs">
      <ol>
        {items.map((i) => (
          <Fragment key={i.label}>
            <li><Link to={i.to}>{i.label}</Link><span className="sep" aria-hidden="true">/</span></li>
          </Fragment>
        ))}
        <li><b aria-current="page">{current}</b></li>
      </ol>
    </nav>
  );
}
