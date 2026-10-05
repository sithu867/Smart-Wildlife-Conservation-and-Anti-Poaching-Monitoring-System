import { useId, type ReactNode } from 'react';

export function FeedbackPanel({
  tone,
  title,
  children,
}: {
  tone: 'validation' | 'system' | 'info';
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      className={`analytics-feedback analytics-feedback--${tone}`}
      role={tone === 'info' ? 'status' : 'alert'}
      aria-labelledby={titleId}
    >
      <h3 id={titleId}>{title}</h3>
      {children}
    </div>
  );
}
