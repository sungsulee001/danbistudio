/**
 * The panel head, set the way Broadsheet sets a card: a 10px accent kicker at
 * 0.1em over a 19px serif title, with no rule between them. Hierarchy comes
 * from the type scale and the space under it, not from a divider.
 */
export function PanelTitle({
  eyebrow,
  title,
  eyebrowClassName = 'text-micro font-semibold uppercase tracking-[0.1em] text-accent-700',
  titleClassName = 'mt-1 font-heading text-lg font-semibold leading-tight text-ink',
  titleElement = 'h1',
}: {
  eyebrow: string;
  title: string;
  eyebrowClassName?: string;
  titleClassName?: string;
  titleElement?: 'h1' | 'h2';
}) {
  const TitleElement = titleElement;

  return (
    <div>
      <div className={eyebrowClassName}>{eyebrow}</div>
      <TitleElement className={titleClassName}>{title}</TitleElement>
    </div>
  );
}
