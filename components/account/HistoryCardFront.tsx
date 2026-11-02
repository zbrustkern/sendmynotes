'use client';

import type { AccountHistoryOrder } from '@/lib/account/history';
import { PrivateImage } from './library/PrivateImage';

export function HistoryCardFront({ order }: { order: Pick<AccountHistoryOrder, 'id' | 'frontAvailable' | 'recipientName'> }) {
  if (!order.frontAvailable) return <span className="account-cover-placeholder" aria-hidden="true">Note</span>;

  return <PrivateImage
    path={`/api/account/history/${encodeURIComponent(order.id)}/media`}
    alt={`Saved card front for ${order.recipientName}`}
    className="block w-full aspect-[17/22] rounded object-contain bg-stone-100"
  />;
}
