export interface VisibleIssueListSummary<T> {
  visibleItems: T[];
  hiddenCount: number;
  hiddenLabel?: string;
}

export function buildVisibleIssueListSummary<T>(
  items: T[],
  visibleLimit: number,
  itemLabel: string,
): VisibleIssueListSummary<T> {
  const safeLimit = Math.max(0, Math.floor(Number.isFinite(visibleLimit) ? visibleLimit : 0));
  const visibleItems = items.slice(0, safeLimit);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return {
    visibleItems,
    hiddenCount,
    ...(hiddenCount > 0 ? { hiddenLabel: `${hiddenCount} more ${pluralize(itemLabel, hiddenCount)}` } : {}),
  };
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}
