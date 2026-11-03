const assert = require('node:assert/strict');
const automation = require('../automation-core.js');

assert.equal(automation.indiaDate('2026-11-03T20:00:00.000Z'), '2026-11-04');

const source = {
  title: 'A daily headline worth following',
  description: 'A short report summary for the dashboard preview.',
  source: 'Example News',
  url: 'https://example.com/story'
};
const date = '2026-11-04';
const first = automation.queueDailyDraft({ drafts: [], dismissedDates: [] }, source, date, 'News', 'Margin Editors');
assert.equal(first.reason, 'created');
assert.equal(first.draft.category, 'News');
assert.equal(first.draft.sourceUrl, source.url);
assert.match(first.draft.body, /Review the original report/);

const duplicate = automation.queueDailyDraft(first.state, source, date, 'News', 'Margin Editors');
assert.equal(duplicate.reason, 'already-prepared');
assert.equal(duplicate.state.drafts.length, 1);

const dismissed = automation.queueDailyDraft({ drafts: [], dismissedDates: [date] }, source, date, 'News', 'Margin Editors');
assert.equal(dismissed.reason, 'dismissed');

const duplicateSource = automation.queueFromArticle(first.state, source, date, 'News', 'Margin Editors');
assert.equal(duplicateSource.reason, 'already-queued');

const unsafe = automation.createDailyDraft({ ...source, url: 'javascript:alert(1)' }, date);
assert.equal(unsafe, null);
console.log('Daily automation checks passed.');
