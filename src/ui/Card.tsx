import type { ReactNode } from 'react';

/** A surface container. Optional title renders as the card heading. */
export function Card({
  title,
  children,
  className,
  ...rest
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`ht-card${className ? ` ${className}` : ''}`} {...rest}>
      {title !== undefined && <h2 className="ht-card__title">{title}</h2>}
      {children}
    </section>
  );
}
