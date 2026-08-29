// bird_names / new_bird_days / bird_pose: name captions under the collage
// birds ('all' | 'new' | 'none') with a "new" badge on recent first-ever
// arrivals, and the configurable sit-vs-fly rule ('confidence' | 'new' |
// 'sit' | 'fly').
//
// Fixture: Anna's Hummingbird is ESTABLISHED (first heard 100 days ago) with
// a LOW best confidence (0.55), the Raven is NEW (first heard 2 days ago)
// with a HIGH confidence (0.99) - so the 'confidence' and 'new' pose rules
// give OPPOSITE poses per bird and the test can tell which rule ran.
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

const OLD_FIRST = fmtTs(Date.now() - 100 * 864e5); // long-established species
const NEW_FIRST = fmtTs(Date.now() - 2 * 864e5);   // first heard 2 days ago
const LAST = fmtTs(Date.now() - 36e5);

function boot(cfg) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://ha.local:8123/x', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  const summary = [
    { scientific_name: 'Calypte anna', common_name: "Anna's Hummingbird", count: 50, first_heard: OLD_FIRST, last_heard: LAST, max_confidence: 0.55 },
    { scientific_name: 'Corvus corax', common_name: 'Common Raven', count: 9, first_heard: NEW_FIRST, last_heard: LAST, max_confidence: 0.99 },
  ];
  const daily = summary.map(s => ({ ...s, hourly_counts: Array(24).fill(1), latest_heard: '13:55:00' }));
  window.fetch = (url) => {
    const p = String(url).replace('http://ha.local:8080', '');
    const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(JSON.stringify(b))) });
    if (p.startsWith('/api/v2/analytics/species/summary')) return ok(summary);
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
  return card;
}

const assert = require('assert');
const cardDefault  = boot({});
const cardAll      = boot({ bird_names: 'all' });
const cardNew      = boot({ bird_names: 'new' });
const cardTightWin = boot({ bird_names: 'new', new_bird_days: 1 });
const cardPoseNew  = boot({ bird_pose: 'new' });
const cardPoseSit  = boot({ bird_pose: 'sit' });
const cardPoseFly  = boot({ bird_pose: 'fly' });

function tile(card, sci) { return card.shadowRoot.querySelector('.gtile[data-sci="' + sci + '"]'); }
function name(card, sci) { const t = tile(card, sci); return t && t.querySelector('.gt-name'); }
function img(card, sci)  { return tile(card, sci).querySelector('img'); }

setTimeout(() => {
  try {
    // Default: no captions anywhere, confidence pose rule untouched -
    // anna (0.55) flies, raven (0.99) perches.
    assert.ok(tile(cardDefault, 'Calypte anna'), 'default: collage rendered');
    assert.ok(!cardDefault.shadowRoot.querySelector('.gt-name'), 'default: no captions');
    assert.ok(img(cardDefault, 'Calypte anna').src.includes('calypte-anna-2.png'), 'default: low-conf anna flies');
    assert.ok(img(cardDefault, 'Corvus corax').src.includes('corvus-corax.png'), 'default: high-conf raven perches');

    // all: both captioned with the BirdNET-Go common name; only the new
    // species carries the badge.
    const annaAll = name(cardAll, 'Calypte anna');
    const ravenAll = name(cardAll, 'Corvus corax');
    assert.ok(annaAll && ravenAll, 'all: both birds captioned');
    assert.ok(annaAll.textContent.includes("Anna's Hummingbird"), 'all: caption is the common name');
    assert.ok(!annaAll.querySelector('.gt-new'), 'all: established bird has no badge');
    assert.ok(ravenAll.querySelector('.gt-new'), 'all: new bird carries the badge');
    assert.ok(ravenAll.textContent.includes('Common Raven'), 'all: badge does not replace the name');

    // new: only the recent first-ever arrival is captioned (badged).
    assert.ok(!name(cardNew, 'Calypte anna'), 'new: established bird uncaptioned');
    assert.ok(name(cardNew, 'Corvus corax'), 'new: new bird captioned');
    assert.ok(name(cardNew, 'Corvus corax').querySelector('.gt-new'), 'new: caption carries the badge');

    // new_bird_days narrows the window: first heard 2 days ago is no
    // longer "new" when the window is 1 day.
    assert.ok(!cardTightWin.shadowRoot.querySelector('.gt-name'), 'new_bird_days=1: nothing is new');

    // bird_pose 'new': the OPPOSITE poses of the confidence rule above -
    // the new bird flies regardless of its 0.99 confidence, the
    // established one perches regardless of its 0.55.
    assert.ok(img(cardPoseNew, 'Calypte anna').src.includes('calypte-anna.png'), "pose new: established bird perches");
    assert.ok(img(cardPoseNew, 'Corvus corax').src.includes('corvus-corax-2.png'), 'pose new: new bird flies');

    // bird_pose 'sit' / 'fly': everyone.
    assert.ok(img(cardPoseSit, 'Calypte anna').src.includes('calypte-anna.png'), 'pose sit: anna perches');
    assert.ok(img(cardPoseSit, 'Corvus corax').src.includes('corvus-corax.png'), 'pose sit: raven perches');
    assert.ok(img(cardPoseFly, 'Calypte anna').src.includes('calypte-anna-2.png'), 'pose fly: anna flies');
    assert.ok(img(cardPoseFly, 'Corvus corax').src.includes('corvus-corax-2.png'), 'pose fly: raven flies');

    console.log('NAMES TEST PASSED (captions all/new/none, new-bird window, pose rules)');
    process.exit(0);
  } catch (e) { console.error('FAIL:', e.message); process.exit(1); }
}, 1700);
