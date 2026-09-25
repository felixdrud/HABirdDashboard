// bird_names / new_badge / new_gone_days / new_shown_days / bird_pose:
// name captions on the collage ('all' | 'new' | 'none'), the independent
// "new" pill, the returning-gap "new" rule, and the configurable
// sit-vs-fly rule ('confidence' | 'new' | 'sit' | 'fly').
//
// Fixture: Anna's Hummingbird is ESTABLISHED (heard continuously - its
// last pre-window detection nearly touches its first in-window one) with
// a LOW best confidence (0.55); the Raven is RETURNING (silent for ~99
// days, heard again yesterday) with a HIGH confidence (0.99) - so the
// 'confidence' and 'new' pose rules give OPPOSITE poses per bird and the
// test can tell which rule ran.
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const CARD = fs.readFileSync(ROOT + '/dist/habird-card.js', 'utf8');

function fmtTs(ms) {
  const d = new Date(ms);
  const p = (n) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function fmtDate(ms) { return fmtTs(ms).slice(0, 10); }

const DAY = 864e5;
const NOW = Date.now();

function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://ha.local:8123/x', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const summary = [   // all-time (lifelist + confidence backfill)
    { scientific_name: 'Calypte anna', common_name: "Anna's Hummingbird", count: 500, first_heard: fmtTs(NOW - 300 * DAY), last_heard: fmtTs(NOW - 36e5), max_confidence: 0.55 },
    { scientific_name: 'Corvus corax', common_name: 'Common Raven', count: 9, first_heard: fmtTs(NOW - 400 * DAY), last_heard: fmtTs(NOW - 36e5), max_confidence: 0.99 },
  ];
  const beforeRows = [   // summary [2000-01-01 .. today-shown]: last heard BEFORE the shown window
    { scientific_name: 'Calypte anna', common_name: "Anna's Hummingbird", count: 490, last_heard: fmtTs(NOW - 4 * DAY), max_confidence: 0.55 },
    { scientific_name: 'Corvus corax', common_name: 'Common Raven', count: 6, last_heard: fmtTs(NOW - 100 * DAY), max_confidence: 0.99 },
  ];
  const sinceRows = [    // summary [today-shown .. today]: the current appearance
    { scientific_name: 'Calypte anna', common_name: "Anna's Hummingbird", count: 10, first_heard: fmtTs(NOW - 3 * DAY), max_confidence: 0.55 },
    { scientific_name: 'Corvus corax', common_name: 'Common Raven', count: 3, first_heard: fmtTs(NOW - 1 * DAY), max_confidence: 0.99 },
  ];
  // Anna's gap: 4d -> 3d ago = 1 day (not new). Raven's: 100d -> 1d ago = 99 days (new at gone<=99).
  const daily = summary.map(s => ({ ...s, hourly_counts: Array(24).fill(1), latest_heard: '13:55:00' }));
  const calls = [];
  window.fetch = (url) => {
    const p = String(url).replace('http://ha.local:8080', '');
    calls.push(p);
    const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(b))) });
    if (p.startsWith('/api/v2/analytics/species/summary')) {
      const q = p.split('?')[1] || '';
      if (q.includes('start_date=2000-01-01')) return ok(beforeRows);
      if (q.includes('start_date=')) return ok(sinceRows);
      return ok(summary);
    }
    if (p.startsWith('/api/v2/analytics/species/daily')) return ok(daily);
    if (p.includes('/analytics/')) return ok({ data: [] });
    if (p.includes('/detections')) return ok({ data: [] });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(404) });
  };
  window.Audio = class { addEventListener(){} load(){} play(){return Promise.resolve();} pause(){} };
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { get() { return this.id === 'collage' ? 1200 : 300; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { get() { return this.id === 'collage' ? 800 : 100; } });
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.ResizeObserver = class { observe(){} disconnect(){} };
  window.eval(CARD);
  const card = window.document.createElement('habird-card');
  card.setConfig(cfg);
  card.hass = { themes: {}, states: {} };
  window.document.body.appendChild(card);
  card.__calls = calls;
  return card;
}

const assert = require('assert');
const cardDefault   = boot({});
const cardAll       = boot({ bird_names: 'all' });
const cardAllBadge  = boot({ bird_names: 'all', new_badge: true });
const cardBadgeOnly = boot({ new_badge: true });
const cardNew       = boot({ bird_names: 'new' });
const cardLongGone  = boot({ bird_names: 'new', new_gone_days: 150 });
const cardShown5    = boot({ bird_names: 'new', new_shown_days: 5 });
const cardPoseNew   = boot({ bird_pose: 'new' });
const cardPoseSit   = boot({ bird_pose: 'sit' });
const cardPoseFly   = boot({ bird_pose: 'fly' });

function tile(card, sci) { return card.shadowRoot.querySelector('.gtile[data-sci="' + sci + '"]'); }
function name(card, sci) { const t = tile(card, sci); return t && t.querySelector('.gt-name'); }
function img(card, sci)  { return tile(card, sci).querySelector('img'); }

setTimeout(() => {
  try {
    // Default: no captions, no badges, no gap fetches, confidence pose -
    // anna (0.55) flies, raven (0.99) perches.
    assert.ok(tile(cardDefault, 'Calypte anna'), 'default: collage rendered');
    assert.ok(!cardDefault.shadowRoot.querySelector('.gt-name'), 'default: no captions');
    assert.ok(!cardDefault.__calls.some(u => u.includes('start_date=2000-01-01')),
      'default: the returning-gap queries are never sent');
    assert.ok(img(cardDefault, 'Calypte anna').src.includes('calypte-anna-2.png'), 'default: low-conf anna flies');
    assert.ok(img(cardDefault, 'Corvus corax').src.includes('corvus-corax.png'), 'default: high-conf raven perches');

    // all: both captioned with the common name, and NO badge (default off).
    const annaAll = name(cardAll, 'Calypte anna');
    const ravenAll = name(cardAll, 'Corvus corax');
    assert.ok(annaAll && ravenAll, 'all: both birds captioned');
    assert.ok(annaAll.textContent.includes("Anna's Hummingbird"), 'all: caption is the common name');
    assert.ok(!cardAll.shadowRoot.querySelector('.gt-new'), 'all: no badge unless new_badge is on');

    // all + new_badge: only the returning bird carries the pill.
    assert.ok(!name(cardAllBadge, 'Calypte anna').querySelector('.gt-new'), 'badge: established bird unmarked');
    const ravenBadged = name(cardAllBadge, 'Corvus corax');
    assert.ok(ravenBadged.querySelector('.gt-new'), 'badge: returning bird marked');
    assert.ok(ravenBadged.textContent.includes('Common Raven'), 'badge: pill rides with the name');

    // new_badge alone (names off): the pill stands alone at the new bird.
    assert.ok(!name(cardBadgeOnly, 'Calypte anna'), 'badge-only: established bird has nothing');
    const ravenOnly = name(cardBadgeOnly, 'Corvus corax');
    assert.ok(ravenOnly && ravenOnly.querySelector('.gt-new.gt-only'), 'badge-only: standalone pill');
    assert.ok(!ravenOnly.textContent.includes('Common Raven'), 'badge-only: no name text');

    // names 'new': only the returning bird is captioned (no badge - off).
    assert.ok(!name(cardNew, 'Calypte anna'), 'new: established bird uncaptioned');
    assert.ok(name(cardNew, 'Corvus corax'), 'new: returning bird captioned');

    // new_gone_days raises the bar: a 99-day silence is not enough at 150.
    assert.ok(!cardLongGone.shadowRoot.querySelector('.gt-name'), 'gone=150: a 99-day gap is not new');

    // new_shown_days moves the query boundary: the "before" summary must
    // end new_shown_days ago.
    const edge5 = fmtDate(NOW - 5 * DAY);
    assert.ok(cardShown5.__calls.some(u => u.includes('start_date=2000-01-01') && u.includes('end_date=' + edge5)),
      'shown=5: the before-window query ends 5 days ago');

    // bird_pose 'new': the OPPOSITE poses of the confidence rule - the
    // returning bird flies despite its 0.99 confidence, the established
    // one perches despite its 0.55.
    assert.ok(img(cardPoseNew, 'Calypte anna').src.includes('calypte-anna.png'), 'pose new: established bird perches');
    assert.ok(img(cardPoseNew, 'Corvus corax').src.includes('corvus-corax-2.png'), 'pose new: returning bird flies');

    // bird_pose 'sit' / 'fly': everyone.
    assert.ok(img(cardPoseSit, 'Calypte anna').src.includes('calypte-anna.png'), 'pose sit: anna perches');
    assert.ok(img(cardPoseSit, 'Corvus corax').src.includes('corvus-corax.png'), 'pose sit: raven perches');
    assert.ok(img(cardPoseFly, 'Calypte anna').src.includes('calypte-anna-2.png'), 'pose fly: anna flies');
    assert.ok(img(cardPoseFly, 'Corvus corax').src.includes('corvus-corax-2.png'), 'pose fly: raven flies');

    console.log('NAMES TEST PASSED (captions, independent badge, returning-gap rule, pose rules)');
    process.exit(0);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
}, 1700);
