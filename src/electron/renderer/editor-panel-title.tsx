export function PanelTitle({
  eyebrow,
  title,
  eyebrowClassName = 'text-xs font-semibold uppercase tracking-wide text-emerald-300',
  titleClassName = 'mt-1 text-lg font-semibold text-zinc-100',
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
