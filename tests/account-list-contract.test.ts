import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as history } from '../app/api/account/history/route';
import { GET as occasions } from '../app/api/account/occasions/route';
import { getOrdersCollection } from '../lib/firebase-admin';
import { accountDoc, accountScope } from '../lib/account/http';
import { fetchAllAccountPages, requireAccountList, upcomingAccountOccasions } from '../lib/account/list-contracts';
import type { AccountHistoryOrder } from '../lib/account/history';
import type { AccountOccasion } from '../lib/account/contracts';

const request = (route: string, uid: string) => new NextRequest(`http://localhost:3000/api/account/${route}`, {
  headers: { host: 'localhost:3000', authorization: `Bearer mock_token_${uid}` },
});

async function run() {
  const emptyResponse = await history(request('history?limit=3', 'history-empty-owner'));
  assert.equal(emptyResponse.status, 200);
  assert.match(emptyResponse.headers.get('cache-control') || '', /private.*no-store/);
  const emptyPayload = await emptyResponse.json();
  const emptyList = requireAccountList<AccountHistoryOrder>(emptyPayload);
  assert.deepEqual(emptyList, { data: [], nextCursor: null }, 'empty history stays a flat list envelope');

  const historyOwner = 'history-page-owner';
  for (let i = 0; i < 4; i += 1) {
    const id = `history_page_${i}`;
    await getOrdersCollection().doc(id).set({
      id, userId: historyOwner, status: 'MAILED', createdAt: 10_000 - i, updatedAt: 10_000 - i,
      recipientAddress: { firstName: `Person ${i}`, lastName: '', country: 'US' },
      handwrittenNote: `Note ${i}`, printedMessage: '', frontImageUrl: '/presets/example.png',
    });
  }
  const overviewResponse = await history(request('history?limit=3', historyOwner));
  const overviewList = requireAccountList<AccountHistoryOrder>(await overviewResponse.json(), 'Card history response shape is invalid.');
  assert.equal(overviewList.data.length, 3, 'overview consumer can read its recent-card page');
  assert.ok(overviewList.nextCursor, 'overview receives a continuation cursor when more history exists');

  const firstResponse = await history(request('history?limit=2', historyOwner));
  const firstPage = requireAccountList<AccountHistoryOrder>(await firstResponse.json());
  assert.equal(firstPage.data.length, 2);
  assert.ok(firstPage.nextCursor);
  const secondResponse = await history(request(`history?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, historyOwner));
  const secondPage = requireAccountList<AccountHistoryOrder>(await secondResponse.json());
  assert.equal(secondPage.data.length, 2);
  assert.equal(new Set([...firstPage.data, ...secondPage.data].map(row => row.id)).size, 4, 'cursor pages do not duplicate history rows');

  assert.throws(
    () => requireAccountList<AccountHistoryOrder>({ data: { data: [], nextCursor: null } }),
    /account list could not be read/i,
    'consumer parser rejects the old double-wrapped success shape instead of allowing rows.map to crash',
  );

  const owner = 'overview-upcoming-owner';
  const partsAt = (days: number) => Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date(Date.now() + days * 86_400_000)).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)])) as { year: number; month: number; day: number };
  const near = partsAt(3);
  const later = partsAt(100);
  const scope = accountScope(owner);
  for (let i = 0; i < 51; i += 1) {
    const id = i === 50 ? 'overview-near-event' : `overview-later-${i}`;
    const date = i === 50 ? near : later;
    await accountDoc('occasions', owner, id).set({
      id, ownerUid: owner, ownerScope: scope, version: 1, createdAt: i === 50 ? 1 : 1000 - i,
      updatedAt: 1, contactId: 'synthetic-person', title: i === 50 ? 'Near event' : `Later event ${i}`,
      type: 'other', month: date.month, day: date.day, recurrence: 'annual', leapDayPolicy: 'feb28',
      reminderEnabled: false, leadDays: 14,
    });
  }
  const loaded = await fetchAllAccountPages<AccountOccasion>(async cursor => {
    const path = `occasions?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const response = await occasions(request(path, owner));
    assert.equal(response.status, 200);
    return response.json();
  });
  assert.equal(loaded.length, 51, 'overview walks beyond the first 50 creation-ordered rows');
  const upcoming = upcomingAccountOccasions(loaded);
  assert.equal(upcoming[0]?.id, 'overview-near-event', 'nearest event on page two sorts ahead of older creation-ordered rows');

  console.log('Account list contracts: history flat envelope, empty/populated overview, cursor pagination, malformed-shape recovery and full upcoming-date ordering passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
