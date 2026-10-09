import { forwardRef } from 'react';

interface Props { messages: string[]; id?: string; list?: boolean }

/** Legacy .olb-errbox. role="alert" so it is announced; focusable so focus can move to it (A3). */
export const AlertBox = forwardRef<HTMLDivElement, Props>(function AlertBox({ messages, id, list = true }, ref) {
  if (messages.length === 0) return null;
  return (
    <div ref={ref} id={id} className="alert" role="alert" tabIndex={-1}>
      {list ? <ul>{messages.map((m) => <li key={m}>{m}</li>)}</ul> : messages[0]}
    </div>
  );
});
