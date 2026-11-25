import type { ActionOpenedPayload } from './actions';
import type { AlertPayload, RankDroppedPayload } from './changes';

type PayloadOf<E extends AlertPayload['event']> = Extract<
  AlertPayload,
  { event: E }
>;

export type WebhookPayloadExamples = {
  [E in AlertPayload['event']]: PayloadOf<E>;
};

const OCCURRED_AT = '2026-07-30T03:10:00.000Z';

const APP = {
  id: 'cm0app0000000000000000001',
  name: 'Habit Tracker',
  store: 'APP_STORE',
  country: 'us',
  iconUrl: 'https://is1-ssl.mzstatic.com/image/thumb/habit/512x512bb.jpg',
} as const;

const COMPETITOR = {
  id: 'cm0app0000000000000000002',
  name: 'Streaks',
  store: 'APP_STORE',
  country: 'us',
  iconUrl: null,
} as const;

const KEYWORD = {
  id: 'cm0kwd0000000000000000001',
  text: 'habit tracker',
  store: 'APP_STORE',
  country: 'us',
} as const;

const RANK_DROP: RankDroppedPayload = {
  event: 'rank.dropped',
  occurredAt: OCCURRED_AT,
  app: APP,
  keyword: KEYWORD,
  from: 4,
  to: 12,
  fromDepth: 200,
  toDepth: 200,
  threshold: 5,
};

const ACTION: ActionOpenedPayload = {
  event: 'action.opened',
  occurredAt: OCCURRED_AT,
  app: APP,
  action: {
    id: 'cm0act0000000000000000001',
    rule: 'keyword.add_uncovered',
    category: 'metadata',
    priority: 'high',
    impact: 71,
    firstSeenAt: OCCURRED_AT,
    reopened: false,
  },
  keyword: { id: 'cm0kwd0000000000000000002', text: 'daily goals' },
  evidence: {
    rule: 'keyword.add_uncovered',
    opportunity: 66.5,
    traffic: 7.2,
    difficulty: 3.1,
    volume: 62,
    relevance: 80,
    latestPosition: 38,
    indexedFields: ['title', 'subtitle', 'keywordField'],
    uncoveredFields: ['title', 'subtitle', 'keywordField'],
    keywordFieldCharsFree: 18,
    scoreProvenance: null,
  },
  link: 'https://aso.example.com/actions?action=cm0act0000000000000000001',
};

const CHART = {
  store: 'APP_STORE',
  country: 'us',
  collection: 'free',
  genre: '6013',
  genreName: 'Health & Fitness',
  device: 'iphone',
} as const;

export const WEBHOOK_PAYLOAD_EXAMPLES: WebhookPayloadExamples = {
  'metadata.changed': {
    event: 'metadata.changed',
    occurredAt: OCCURRED_AT,
    app: { ...COMPETITOR, isCompetitor: true },
    changes: [
      {
        field: 'subtitle',
        before: 'Build better habits',
        after: 'Habit tracker and daily goals',
      },
    ],
  },
  'rank.dropped': RANK_DROP,
  'rank.improved': {
    event: 'rank.improved',
    occurredAt: OCCURRED_AT,
    app: APP,
    keyword: KEYWORD,
    from: 18,
    to: 6,
    fromDepth: 200,
    toDepth: 200,
    threshold: 5,
  },
  'rank.milestone': {
    event: 'rank.milestone',
    occurredAt: OCCURRED_AT,
    app: APP,
    keyword: KEYWORD,
    tier: 10,
    direction: 'entered',
    from: 14,
    to: 9,
    fromDepth: 200,
    toDepth: 200,
  },
  'rank.first': {
    event: 'rank.first',
    occurredAt: OCCURRED_AT,
    app: APP,
    keyword: KEYWORD,
    position: 27,
    depth: 200,
  },
  'rank.overtaken': {
    event: 'rank.overtaken',
    occurredAt: OCCURRED_AT,
    app: APP,
    keyword: KEYWORD,
    competitor: { id: COMPETITOR.id, name: COMPETITOR.name, from: 9, to: 6 },
    from: 7,
    to: 8,
    fromDepth: 200,
    toDepth: 200,
  },
  'review.negative': {
    event: 'review.negative',
    occurredAt: OCCURRED_AT,
    app: APP,
    review: {
      score: 1,
      title: 'Lost my streak',
      text: 'The update reset every streak I had.',
      version: '2.4.0',
      reviewedAt: '2026-07-29T18:22:00.000Z',
    },
  },
  'review.new': {
    event: 'review.new',
    occurredAt: OCCURRED_AT,
    app: APP,
    review: {
      author: 'sam',
      score: 5,
      title: 'Great app',
      text: 'Exactly the reminders I needed.',
      version: '2.4.0',
      reviewedAt: '2026-07-29T18:22:00.000Z',
    },
  },
  'rating.dropped': {
    event: 'rating.dropped',
    occurredAt: OCCURRED_AT,
    app: APP,
    country: 'us',
    from: 4.6,
    to: 4.4,
    fromCount: 2184,
    toCount: 2240,
    fromDate: '2026-07-28',
    toDate: '2026-07-29',
    dropTenths: 2,
    version: '2.4.0',
    actionId: null,
  },
  'review.spike': {
    event: 'review.spike',
    occurredAt: OCCURRED_AT,
    app: APP,
    date: '2026-07-29',
    count: 41,
    median: 6,
    threshold: 18,
    lowShare: 0.73,
    lowScoreMax: 2,
    topTheme: { phrase: 'cannot sign in', kind: 'complaint', mentions: 17 },
  },
  'app.delisted': {
    event: 'app.delisted',
    occurredAt: OCCURRED_AT,
    app: { ...COMPETITOR, isCompetitor: true },
    store: 'APP_STORE',
    country: 'us',
    date: '2026-07-29',
  },
  'app.unlisted_market': {
    event: 'app.unlisted_market',
    occurredAt: OCCURRED_AT,
    app: { ...APP, isCompetitor: false },
    store: 'APP_STORE',
    country: 'us',
    market: 'de',
    date: '2026-07-29',
    trackedKeywords: 12,
  },
  'digest.weekly': {
    event: 'digest.weekly',
    occurredAt: '2026-08-03T08:00:00.000Z',
    window: { from: '2026-07-27', to: '2026-08-02' },
    apps: [
      {
        id: APP.id,
        name: APP.name,
        visibility: { current: 42.6, delta7d: 6.1 },
        moversUp: [
          {
            keywordId: KEYWORD.id,
            text: KEYWORD.text,
            from: 14,
            to: 9,
            fromDepth: 200,
            toDepth: 200,
          },
        ],
        moversDown: [],
        changes: 1,
        negativeReviews: 3,
        audit: { current: 78, delta7d: 4 },
        actions: { open: 7, critical: 0, high: 2 },
      },
    ],
    groups: [],
  },
  'serp.entrant': {
    event: 'serp.entrant',
    occurredAt: OCCURRED_AT,
    keyword: KEYWORD,
    date: '2026-07-29',
    entrants: [
      {
        position: 6,
        storeAppId: '1234567890',
        title: 'Streaks',
        appId: COMPETITOR.id,
        isCompetitor: true,
      },
    ],
  },
  'action.opened': ACTION,
  'chart.entered': {
    event: 'chart.entered',
    occurredAt: OCCURRED_AT,
    app: APP,
    chart: CHART,
    date: '2026-07-29',
    depth: 200,
    from: null,
    to: 84,
  },
  'chart.left': {
    event: 'chart.left',
    occurredAt: OCCURRED_AT,
    app: APP,
    chart: CHART,
    date: '2026-07-29',
    depth: 200,
    from: 191,
    to: null,
  },
  'chart.milestone': {
    event: 'chart.milestone',
    occurredAt: OCCURRED_AT,
    app: APP,
    chart: CHART,
    date: '2026-07-29',
    depth: 200,
    tier: 10,
    direction: 'entered',
    from: 13,
    to: 8,
  },
  'alerts.batch': {
    event: 'alerts.batch',
    scope: 'owned_apps',
    occurredAt: OCCURRED_AT,
    window: {
      from: '2026-07-29T03:10:00.000Z',
      to: OCCURRED_AT,
    },
    totals: { events: 2, apps: 1 },
    apps: [
      {
        app: APP,
        rankDrops: [RANK_DROP],
        rankImprovements: [],
        rankMilestones: [],
        firstRankings: [],
        overtakes: [],
        serpEntrants: [],
        changes: [],
        negativeReviews: [],
        actions: [ACTION],
        competitors: [],
      },
    ],
    events: [RANK_DROP, ACTION],
  },
};
