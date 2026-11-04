import { isFinalized, type GroupLine, type Line, type Status } from '@vsf/shared';

export function acceptsItems(status: Status, deadline: Date, now: Date) {
  return status === 'OPEN' && deadline > now;
}

export function transition(status: Status, action: 'close' | 'extend' | 'reopen' | 'cancel'): Status | undefined {
  if (action === 'reopen') return isFinalized(status) ? 'OPEN' : undefined;
  if (status === 'CANCELLED') return undefined;
  if (action === 'extend') return 'OPEN';
  if (status !== 'OPEN') return undefined;
  return action === 'close' ? 'CLOSED' : 'CANCELLED';
}

export function totals(lines: readonly Pick<Line, 'unitPrice' | 'quantity'>[]) {
  let quantity = 0;
  let total = 0;
  for (const line of lines) {
    quantity += line.quantity;
    total += line.unitPrice * line.quantity;
  }
  return { quantity, total };
}

export function groupLines(lines: readonly Line[]): GroupLine[] {
  const grouped = new Map<string, GroupLine>();
  for (const { name, menuItemId, unitPrice, quantity } of lines) {
    const key = JSON.stringify([menuItemId, name, unitPrice]);
    const combined = quantity + (grouped.get(key)?.quantity ?? 0);
    grouped.set(key, { key, name, unitPrice, quantity: combined, total: unitPrice * combined });
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.unitPrice - b.unitPrice);
}
