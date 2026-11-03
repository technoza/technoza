(function exposeAutomation(root, factory) {
  const automation = factory();
  if (typeof module === 'object' && module.exports) module.exports = automation;
  else root.MarginAutomation = automation;
})(typeof window === 'object' ? window : globalThis, function createAutomation() {
  function safeSourceUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  }

  function indiaDate(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(value));
    const piece = type => parts.find(part => part.type === type)?.value || '';
    return `${piece('year')}-${piece('month')}-${piece('day')}`;
  }

  function createDailyDraft(article, date, category = 'News', author = 'Margin Editors') {
    const title = String(article?.title || '').trim().slice(0, 110);
    const sourceUrl = safeSourceUrl(article?.url);
    if (!title || !sourceUrl || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const sourceName = String(article?.source || 'Original publisher').trim().slice(0, 100) || 'Original publisher';
    const description = String(article?.description || '').trim().slice(0, 420);
    const excerpt = (description || `A daily news brief based on reporting from ${sourceName}.`).slice(0, 220);
    const body = description
      ? `**What happened**\n${description}\n\n**Read the original reporting**\nThis starter draft is based on a headline and short summary from ${sourceName}. Review the original report, add your perspective, and confirm the details before publishing.`
      : `**A story to follow**\n${title}\n\nThis starter draft is based on reporting from ${sourceName}. Open the original report, add the verified details and your perspective, then review it before publishing.`;
    const id = `daily-${date}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'news'}`;
    return {
      queueId: id,
      title,
      excerpt,
      category: String(category || 'News'),
      author: String(author || 'Margin Editors'),
      date,
      body,
      sourceUrl,
      sourceName,
      automationDate: date,
      status: 'needs-review',
      featured: false,
      imageAlt: ''
    };
  }

  function normalizeState(value) {
    return {
      drafts: Array.isArray(value?.drafts) ? value.drafts : [],
      dismissedDates: Array.isArray(value?.dismissedDates) ? [...new Set(value.dismissedDates.map(String))] : []
    };
  }

  function queueDailyDraft(stateValue, article, date, category, author) {
    const state = normalizeState(stateValue);
    if (state.dismissedDates.includes(date)) return { state, draft: null, reason: 'dismissed' };
    if (state.drafts.some(draft => draft.automationDate === date)) return { state, draft: null, reason: 'already-prepared' };
    const draft = createDailyDraft(article, date, category, author);
    if (!draft) return { state, draft: null, reason: 'invalid-source' };
    return { state: { ...state, drafts: [draft, ...state.drafts] }, draft, reason: 'created' };
  }

  function queueFromArticle(stateValue, article, date, category, author) {
    const state = normalizeState(stateValue);
    const draft = createDailyDraft(article, date, category, author);
    if (!draft) return { state, draft: null, reason: 'invalid-source' };
    if (state.drafts.some(item => item.sourceUrl === draft.sourceUrl)) return { state, draft: null, reason: 'already-queued' };
    return { state: { ...state, drafts: [draft, ...state.drafts] }, draft, reason: 'created' };
  }

  return { safeSourceUrl, indiaDate, createDailyDraft, queueDailyDraft, queueFromArticle, normalizeState };
});
