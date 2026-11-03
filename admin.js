(() => {
  const CONFIG_KEY = 'margin-github-connection';
  const DRAFT_KEY = 'margin-writing-draft';
  const AUTOMATION_KEY = 'margin-daily-news-queue';
  const FILE_PATH = 'content/posts.json';
  const CATEGORY_PATH = 'content/categories.json';
  const NEWS_PATH = 'content/news.json';
  const AUTH_USER = 'shadow111gardens-star';
  const DEFAULT_REPO_OWNER = 'technoza';
  const DEFAULT_REPO_NAME = 'technoza';
  const views = [...document.querySelectorAll('.dash-view')];
  const form = document.getElementById('post-form');
  const imageInput = document.getElementById('post-image');
  const toast = document.getElementById('dash-toast');
  let config = readConfig();
  let posts = [];
  let categories = [];
  let editingId = null;
  let existingImage = '';
  let toastTimer;
  let automationState = readAutomationState();
  let newsArticles = [];
  let newsUpdatedAt = null;
  let activeAutomationDraftId = null;
  let activeAutomationMeta = null;

  function readAutomationState() {
    try { return window.MarginAutomation.normalizeState(JSON.parse(localStorage.getItem(AUTOMATION_KEY) || '{}')); }
    catch { return { drafts: [], dismissedDates: [] }; }
  }
  function saveAutomationState() {
    localStorage.setItem(AUTOMATION_KEY, JSON.stringify(automationState));
  }
  function dateInIndia(value) {
    return window.MarginAutomation.indiaDate(value);
  }
  function sourceLink(value) {
    return window.MarginAutomation.safeSourceUrl(value);
  }

  function readConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); } catch { return null; }
  }
  function escape(value = '') {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }
  function dateInputValue(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function formatDate(value) {
    if (!value) return 'Undated';
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
  }
  function slugify(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'new-story';
  }
  function encodeBase64(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  }
  function decodeBase64(value) {
    const binary = atob(String(value).replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  function setToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }
  function statusMessage(message, kind = '') {
    const element = document.getElementById('connection-feedback');
    element.textContent = message;
    element.className = `connection-feedback ${kind}`.trim();
  }
  function showGate() {
    document.getElementById('admin-gate').hidden = false;
    document.getElementById('admin-shell').hidden = true;
    document.getElementById('owner-auth-token').focus({ preventScroll: true });
  }
  function showShell() {
    document.getElementById('admin-gate').hidden = true;
    document.getElementById('admin-shell').hidden = false;
  }
  async function verifyOwner(token) {
    const response = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 ? 'GitHub did not accept this token. Check it and try again.' : (user.message || 'Could not verify this GitHub account.'));
    if (String(user.login || '').toLowerCase() !== AUTH_USER) throw new Error(`This writing desk is private to @${AUTH_USER}. Sign in with that GitHub account.`);
    return user;
  }
  function goTo(viewName) {
    views.forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    document.querySelectorAll('.side-link').forEach(button => button.classList.toggle('active', button.dataset.view === viewName));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (viewName === 'compose') document.getElementById('post-title').focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => goTo(button.dataset.view)));
  document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => goTo(button.dataset.go)));

  async function githubRequest(path, options = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config?.token || ''}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    const response = await fetch(`https://api.github.com${path}`, { ...options, headers });
    let result = {};
    try { result = await response.json(); } catch {}
    if (!response.ok) {
      const message = result.message || `GitHub returned ${response.status}`;
      throw new Error(response.status === 401 ? 'GitHub did not accept this token. Check it and try again.' : response.status === 403 ? `GitHub denied access. Check the token’s Contents permission. ${message}` : response.status === 404 ? 'Repository or file not found. Check its owner, name, and branch.' : message);
    }
    return result;
  }
  function repoPath(path, query = '') {
    const owner = encodeURIComponent(config.owner);
    const repo = encodeURIComponent(config.repo);
    return `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}${query}`;
  }
  async function readGithubPosts() {
    const result = await githubRequest(repoPath(FILE_PATH, `?ref=${encodeURIComponent(config.branch || 'main')}`));
    if (!result.content) throw new Error('The repository returned an empty posts file.');
    const parsed = JSON.parse(decodeBase64(result.content));
    if (!Array.isArray(parsed)) throw new Error('content/posts.json should contain a list of stories.');
    return parsed;
  }
  async function readGithubCategories() {
    const result = await githubRequest(repoPath(CATEGORY_PATH, `?ref=${encodeURIComponent(config.branch || 'main')}`));
    if (!result.content) throw new Error('The repository returned an empty categories file.');
    const parsed = JSON.parse(decodeBase64(result.content));
    if (!Array.isArray(parsed)) throw new Error('content/categories.json should contain a list of category names.');
    return [...new Set(parsed.map(item => String(item).trim()).filter(Boolean))];
  }
  async function readLocalPosts() {
    try {
      const response = await fetch(`content/posts.json?v=${Date.now()}`, { cache: 'no-store' });
      return response.ok ? await response.json() : [];
    } catch { return []; }
  }
  async function readLocalCategories() {
    try {
      const response = await fetch(`content/categories.json?v=${Date.now()}`, { cache: 'no-store' });
      return response.ok ? await response.json() : [];
    } catch { return []; }
  }
  async function writeGithubFile(path, content, message) {
    return writeGithubBase64(path, encodeBase64(content), message);
  }
  async function writeGithubBase64(path, encodedContent, message) {
    let sha;
    try {
      const current = await githubRequest(repoPath(path, `?ref=${encodeURIComponent(config.branch || 'main')}`));
      sha = current.sha;
    } catch (error) {
      if (!String(error.message).includes('not found')) throw error;
    }
    const body = { message, content: encodedContent, branch: config.branch || 'main' };
    if (sha) body.sha = sha;
    return githubRequest(repoPath(path), { method: 'PUT', body: JSON.stringify(body) });
  }
  async function uploadImage(path, data) {
    return writeGithubBase64(path, data, `Add cover image: ${path.split('/').at(-1)}`);
  }

  function renderAutomation() {
    const today = dateInIndia(new Date());
    const fresh = Boolean(newsUpdatedAt && dateInIndia(newsUpdatedAt) === today);
    const status = document.getElementById('daily-news-status');
    const detail = document.getElementById('daily-news-meta');
    const overview = document.getElementById('automation-overview-state');
    if (status) {
      status.textContent = fresh ? 'Today’s news brief is ready' : newsArticles.length ? 'Waiting for today’s news refresh' : 'Waiting for the secure news feed';
      detail.textContent = newsUpdatedAt
        ? `Last refreshed ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(newsUpdatedAt))} IST. One private draft is prepared when you open this desk each day.`
        : 'The daily feed needs the GNEWS_API_KEY secret and a successful refresh workflow.';
    }
    if (overview) {
      const todayDraft = automationState.drafts.find(draft => draft.automationDate === today);
      overview.textContent = todayDraft ? 'Today’s draft is waiting for your review' : fresh ? 'Today’s headlines are ready for a draft' : 'Waiting for today’s news brief';
    }
    const optionHost = document.getElementById('daily-news-options');
    const count = document.getElementById('daily-news-count');
    if (optionHost) {
      const options = newsArticles.slice(0, 6);
      if (count) count.textContent = `${options.length} ${options.length === 1 ? 'STORY' : 'STORIES'}`;
      optionHost.innerHTML = options.length ? options.map((article, index) => {
        const link = sourceLink(article.url);
        return `<article class="daily-news-option"><div class="daily-news-option-meta"><span>${escape(article.source || 'Original publisher')}</span><span>${escape(formatDate(String(article.publishedAt || '').slice(0, 10)))}</span></div><h3>${escape(article.title || 'Untitled story')}</h3>${article.description ? `<p>${escape(article.description)}</p>` : ''}<div class="daily-news-option-actions">${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">Read source ↗</a>` : '<span></span>'}<button type="button" data-news-draft="${index}">Prepare draft <span>＋</span></button></div></article>`;
      }).join('') : '<div class="list-loading">No headlines in the latest brief. Run the daily news workflow after adding its secret.</div>';
      optionHost.querySelectorAll('[data-news-draft]').forEach(button => button.addEventListener('click', () => {
        const article = options[Number(button.dataset.newsDraft)];
        const result = window.MarginAutomation.queueFromArticle(automationState, article, today, categories.includes('News') ? 'News' : categories[0], config?.author || 'Margin Editors');
        if (!result.draft) { setToast(result.reason === 'already-queued' ? 'That source is already in your approval queue.' : 'This headline could not be turned into a draft.', true); return; }
        automationState = result.state;
        saveAutomationState();
        renderAutomation();
        setToast('Draft prepared. Review it and add your cover image.');
      }));
    }
    const draftsHost = document.getElementById('automated-draft-list');
    const draftCount = document.getElementById('automated-draft-count');
    if (!draftsHost) return;
    const drafts = [...automationState.drafts].sort((a, b) => String(b.automationDate || '').localeCompare(String(a.automationDate || '')));
    if (draftCount) draftCount.textContent = `${drafts.length} ${drafts.length === 1 ? 'WAITING' : 'WAITING'}`;
    draftsHost.innerHTML = drafts.length ? drafts.map(draft => `<article class="automated-draft-card"><div class="automated-draft-top"><span class="draft-review-pill">NEEDS YOUR REVIEW</span><span>${escape(formatDate(draft.automationDate))}</span></div><h3>${escape(draft.title)}</h3><p>${escape(draft.excerpt)}</p><div class="automated-draft-source">From ${escape(draft.sourceName || 'Original publisher')}</div><div class="automated-draft-actions"><button type="button" data-review-news="${escape(draft.queueId)}">Review &amp; add image <span>↗</span></button><button type="button" data-dismiss-news="${escape(draft.queueId)}" aria-label="Dismiss ${escape(draft.title)}">Dismiss</button></div></article>`).join('') : '<div class="list-loading">Your next draft will be prepared when today’s brief is ready.</div>';
    draftsHost.querySelectorAll('[data-review-news]').forEach(button => button.addEventListener('click', () => reviewAutomationDraft(button.dataset.reviewNews)));
    draftsHost.querySelectorAll('[data-dismiss-news]').forEach(button => button.addEventListener('click', () => dismissAutomationDraft(button.dataset.dismissNews)));
  }

  async function loadDailyAutomation() {
    const host = document.getElementById('daily-news-options');
    if (host) host.innerHTML = '<div class="list-loading">Checking the latest news…</div>';
    try {
      const response = await fetch(`${NEWS_PATH}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`The news brief returned ${response.status}.`);
      const feed = await response.json();
      newsArticles = Array.isArray(feed.articles) ? feed.articles.filter(article => article?.title && sourceLink(article.url)) : [];
      newsUpdatedAt = feed.updatedAt || null;
      const today = dateInIndia(new Date());
      if (newsUpdatedAt && dateInIndia(newsUpdatedAt) === today && newsArticles.length) {
        const result = window.MarginAutomation.queueDailyDraft(automationState, newsArticles[0], today, categories.includes('News') ? 'News' : categories[0], config?.author || 'Margin Editors');
        if (result.draft) {
          automationState = result.state;
          saveAutomationState();
        }
      }
    } catch (error) {
      newsArticles = [];
      newsUpdatedAt = null;
      if (host) host.innerHTML = `<div class="list-loading">${escape(error.message || 'The daily news feed could not be loaded.')}</div>`;
    }
    renderAutomation();
  }

  function reviewAutomationDraft(queueId) {
    const draft = automationState.drafts.find(item => item.queueId === queueId);
    if (!draft) return;
    clearComposer();
    activeAutomationDraftId = draft.queueId;
    activeAutomationMeta = { sourceUrl: draft.sourceUrl, sourceName: draft.sourceName };
    document.getElementById('compose-title').innerHTML = 'Review today’s <em>draft.</em>';
    document.getElementById('post-title').value = draft.title || '';
    document.getElementById('post-excerpt').value = draft.excerpt || '';
    document.getElementById('post-category').value = categories.includes(draft.category) ? draft.category : (categories[0] || '');
    document.getElementById('post-author').value = draft.author || 'Margin Editors';
    document.getElementById('post-date').value = draft.date || dateInputValue();
    document.getElementById('post-body').value = draft.body || '';
    document.getElementById('post-image-alt').value = draft.imageAlt || draft.title || '';
    document.getElementById('draft-state').textContent = 'Needs your review and a cover image';
    document.getElementById('publish-button').innerHTML = 'Approve & publish <span>↗</span>';
    document.getElementById('automation-review-banner').hidden = false;
    document.getElementById('automation-source-link').href = sourceLink(draft.sourceUrl);
    document.getElementById('automation-source-link').textContent = `Read original report from ${draft.sourceName || 'publisher'} ↗`;
    goTo('compose');
  }

  function dismissAutomationDraft(queueId) {
    const draft = automationState.drafts.find(item => item.queueId === queueId);
    if (!draft) return;
    automationState = {
      ...automationState,
      drafts: automationState.drafts.filter(item => item.queueId !== queueId),
      dismissedDates: draft.automationDate ? [...new Set([...automationState.dismissedDates, draft.automationDate])] : automationState.dismissedDates
    };
    saveAutomationState();
    renderAutomation();
  }

  document.getElementById('recheck-news').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Checking…';
    try { await loadDailyAutomation(); setToast('Daily news desk checked.'); }
    finally { button.disabled = false; button.textContent = 'Recheck today’s feed ↻'; }
  });

  async function loadDashboard() {
    const now = new Date();
    document.getElementById('today-date').textContent = new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(now).toUpperCase();
    const avatar = config?.owner ? config.owner.slice(0, 1).toUpperCase() : 'M';
    document.getElementById('user-avatar').textContent = avatar;
    populateConnectionFields();
    if (config?.owner && config?.repo && config?.token) {
      setConnectionUI(true);
      try {
        posts = await readGithubPosts();
        try { categories = await readGithubCategories(); }
        catch { categories = await readLocalCategories(); }
        categories = [...new Set([...categories, ...posts.map(post => post.category).filter(Boolean)])];
        renderCategoryOptions();
        renderManagedCategories();
        renderPosts();
        goTo('overview');
      } catch (error) {
        posts = await readLocalPosts();
        categories = await readLocalCategories();
        categories = [...new Set([...categories, ...posts.map(post => post.category).filter(Boolean)])];
        renderCategoryOptions();
        renderManagedCategories();
        renderPosts();
        document.getElementById('overview-banner').classList.remove('connected');
        document.querySelector('#overview-banner .banner-copy strong').textContent = 'GitHub needs a quick check';
        document.querySelector('#overview-banner .banner-copy span').textContent = `${error.message} Open settings to review your connection.`;
        setConnectionUI(false);
        statusMessage(error.message, 'error');
        goTo('connection');
      }
    } else {
      posts = await readLocalPosts();
      renderPosts();
      setConnectionUI(false);
      goTo('connection');
    }
    restoreDraft();
    await loadDailyAutomation();
  }
  function populateConnectionFields() {
    document.getElementById('github-owner').value = config?.owner || '';
    document.getElementById('github-repo').value = config?.repo || '';
    document.getElementById('github-branch').value = config?.branch || 'main';
    document.getElementById('github-token').value = config?.token || '';
    document.getElementById('disconnect-button').hidden = !config;
  }
  function setConnectionUI(connected) {
    const sidebarDot = document.getElementById('sidebar-connection');
    const status = document.getElementById('connection-state');
    const banner = document.getElementById('overview-banner');
    sidebarDot.classList.toggle('connected', connected);
    status.textContent = connected ? 'CONNECTED' : 'NOT CONNECTED';
    status.classList.toggle('connected', connected);
    document.getElementById('connection-summary').textContent = connected ? `Publishing to ${config.owner}/${config.repo} · ${config.branch || 'main'}` : 'Your posts will be saved to this repository.';
    document.getElementById('github-token').required = !config?.token;
    document.getElementById('disconnect-button').hidden = !config;
    banner.classList.toggle('connected', connected);
    if (connected) {
      document.querySelector('#overview-banner .banner-copy strong').textContent = `Connected to ${config.owner}/${config.repo}`;
      document.querySelector('#overview-banner .banner-copy span').textContent = 'Your stories and cover images are ready to publish from here.';
      document.querySelector('#overview-banner .banner-action').textContent = 'Connection settings ↗';
      document.querySelector('#overview-banner .banner-action').dataset.go = 'connection';
    } else {
      document.querySelector('#overview-banner .banner-copy strong').textContent = 'Connect your GitHub to publish';
      document.querySelector('#overview-banner .banner-copy span').textContent = 'Posts and images will live in your repository, ready for your site.';
      document.querySelector('#overview-banner .banner-action').innerHTML = 'Set up connection <span>↗</span>';
      document.querySelector('#overview-banner .banner-action').dataset.go = 'connection';
    }
  }

  function renderPosts() {
    posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    document.getElementById('published-count').textContent = posts.length;
    const thisMonth = dateInputValue().slice(0, 7);
    document.getElementById('month-count').textContent = posts.filter(post => String(post.date || '').startsWith(thisMonth)).length;
    document.getElementById('story-count-label').textContent = `${posts.length} ${posts.length === 1 ? 'STORY' : 'STORIES'}`;
    const host = document.getElementById('published-list');
    if (!posts.length) {
      host.innerHTML = '<div class="list-loading">Your first published story will find a home here.</div>';
      return;
    }
    host.innerHTML = posts.map(post => `<article class="published-row"><img class="published-thumb" src="${escape(post.image || '')}" alt=""><div class="published-info"><h3>${escape(post.title)}</h3><p>${escape(post.category || 'Journal')} &nbsp; · &nbsp; ${escape(formatDate(post.date))} &nbsp; · &nbsp; By ${escape(post.author || 'Margin Editors')}</p></div><div class="published-actions"><button type="button" class="row-action" data-edit="${escape(post.id)}">Edit</button><button type="button" class="row-action delete" data-delete="${escape(post.id)}">Remove</button></div></article>`).join('');
    host.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editPost(button.dataset.edit)));
    host.querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => deletePost(button.dataset.delete)));
  }

  function renderCategoryOptions() {
    const select = document.getElementById('post-category');
    const current = select.value;
    select.innerHTML = `<option value="" disabled>Choose a category</option>${categories.map(category => `<option value="${escape(category)}">${escape(category)}</option>`).join('')}`;
    select.value = categories.includes(current) ? current : '';
  }
  function renderManagedCategories() {
    const host = document.getElementById('managed-category-list');
    if (!host) return;
    document.getElementById('category-count').textContent = `${categories.length} ${categories.length === 1 ? 'CATEGORY' : 'CATEGORIES'}`;
    if (!categories.length) {
      host.innerHTML = '<div class="list-loading">Add your first category to organize the journal.</div>';
      return;
    }
    host.innerHTML = categories.map(category => {
      const usage = posts.filter(post => post.category === category).length;
      return `<div class="managed-category-row"><span class="managed-category-name">${escape(category)}</span><span class="managed-category-usage">${usage} ${usage === 1 ? 'story' : 'stories'}</span><button type="button" class="category-remove-button" data-remove-category="${escape(category)}" ${usage ? 'disabled title="Move or remove stories in this category first"' : ''}>${usage ? 'In use' : 'Remove'}</button></div>`;
    }).join('');
    host.querySelectorAll('[data-remove-category]:not(:disabled)').forEach(button => button.addEventListener('click', () => removeCategory(button.dataset.removeCategory)));
  }
  function setCategoryFeedback(message, kind = '') {
    const element = document.getElementById('category-feedback');
    element.textContent = message;
    element.className = `category-manager-note ${kind}`.trim();
  }
  document.getElementById('category-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('new-category');
    const name = input.value.trim();
    if (!name) return;
    if (categories.some(category => category.toLowerCase() === name.toLowerCase())) {
      setCategoryFeedback('That category is already in your journal.', 'error');
      return;
    }
    const button = document.getElementById('add-category-button');
    button.disabled = true;
    setCategoryFeedback('Saving your category to GitHub…');
    try {
      const updated = [...categories, name];
      await writeGithubFile(CATEGORY_PATH, `${JSON.stringify(updated, null, 2)}\n`, `Add category: ${name}`);
      categories = updated;
      input.value = '';
      renderCategoryOptions();
      renderManagedCategories();
      setCategoryFeedback(`“${name}” is ready for a new story.`, 'success');
    } catch (error) { setCategoryFeedback(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  async function removeCategory(name) {
    if (posts.some(post => post.category === name)) {
      setCategoryFeedback('This category is in use. Move or remove those stories before removing it.', 'error');
      return;
    }
    if (!window.confirm(`Remove the “${name}” category?`)) return;
    try {
      const updated = categories.filter(category => category !== name);
      await writeGithubFile(CATEGORY_PATH, `${JSON.stringify(updated, null, 2)}\n`, `Remove category: ${name}`);
      categories = updated;
      renderCategoryOptions();
      renderManagedCategories();
      setCategoryFeedback(`“${name}” was removed.`, 'success');
    } catch (error) { setCategoryFeedback(error.message, 'error'); }
  }

  function clearComposer() {
    form.reset();
    editingId = null;
    existingImage = '';
    activeAutomationDraftId = null;
    activeAutomationMeta = null;
    document.getElementById('automation-review-banner').hidden = true;
    document.getElementById('compose-title').innerHTML = 'A new <em>story.</em>';
    document.getElementById('post-date').value = dateInputValue();
    document.getElementById('post-author').value = config?.author || '';
    document.getElementById('draft-state').textContent = 'Ready when you are';
    document.getElementById('publish-button').innerHTML = 'Publish to GitHub <span>↗</span>';
    document.getElementById('image-filename').textContent = 'No image selected';
    document.getElementById('post-image-alt').value = '';
    document.getElementById('cover-preview').innerHTML = '<div class="cover-placeholder"><span>↥</span><strong>Give it a good cover.</strong><small>JPG, PNG or WebP · max 8 MB</small></div>';
  }
  function editPost(id) {
    const post = posts.find(item => item.id === id);
    if (!post) return;
    clearComposer();
    editingId = id;
    existingImage = post.image || '';
    activeAutomationMeta = post.sourceUrl ? { sourceUrl: post.sourceUrl, sourceName: post.sourceName || 'Original publisher' } : null;
    document.getElementById('compose-title').innerHTML = 'Make it <em>better.</em>';
    document.getElementById('publish-button').innerHTML = 'Update on GitHub <span>↗</span>';
    document.getElementById('post-title').value = post.title || '';
    document.getElementById('post-excerpt').value = post.excerpt || '';
    document.getElementById('post-category').value = post.category || '';
    document.getElementById('post-author').value = post.author || '';
    document.getElementById('post-date').value = post.date || dateInputValue();
    document.getElementById('post-body').value = post.body || '';
    document.getElementById('post-featured').checked = Boolean(post.featured);
    document.getElementById('post-image-alt').value = post.imageAlt || '';
    if (existingImage) {
      document.getElementById('cover-preview').innerHTML = `<img src="${escape(existingImage)}" alt="Current cover">`;
      document.getElementById('image-filename').textContent = 'Current cover image';
    }
    document.getElementById('draft-state').textContent = 'Editing a published story';
    goTo('compose');
  }
  async function deletePost(id) {
    const post = posts.find(item => item.id === id);
    if (!post || !window.confirm(`Remove “${post.title}” from the journal?`)) return;
    if (!config?.token) { setToast('Connect GitHub before managing published stories.', true); goTo('connection'); return; }
    try {
      const updated = posts.filter(item => item.id !== id);
      await writeGithubFile(FILE_PATH, `${JSON.stringify(updated, null, 2)}\n`, `Remove story: ${post.title}`);
      posts = updated;
      renderPosts();
      setToast('Story removed from your journal.');
    } catch (error) { setToast(error.message, true); }
  }

  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      imageInput.value = '';
      setToast('Choose a JPG, PNG, or WebP image.', true);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      imageInput.value = '';
      setToast('This image is over 8 MB. Choose a smaller cover image.', true);
      return;
    }
    document.getElementById('image-filename').textContent = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('cover-preview').innerHTML = `<img src="${reader.result}" alt="Selected cover preview">`;
    };
    reader.readAsDataURL(file);
  });

  function getFormData() {
    const title = document.getElementById('post-title').value.trim();
    const body = document.getElementById('post-body').value.trim();
    const words = body.split(/\s+/).filter(Boolean).length;
    const id = editingId || slugify(title);
    const post = {
      id,
      title,
      excerpt: document.getElementById('post-excerpt').value.trim(),
      category: document.getElementById('post-category').value.trim(),
      author: document.getElementById('post-author').value.trim() || 'Margin Editors',
      date: document.getElementById('post-date').value || dateInputValue(),
      readTime: Math.max(1, Math.ceil(words / 210)),
      image: existingImage,
      imageAlt: document.getElementById('post-image-alt').value.trim() || title,
      featured: document.getElementById('post-featured').checked,
      body
    };
    if (activeAutomationMeta?.sourceUrl) {
      post.sourceUrl = sourceLink(activeAutomationMeta.sourceUrl);
      post.sourceName = activeAutomationMeta.sourceName || 'Original publisher';
    }
    return post;
  }
  function markdownToPreview(body) {
    return String(body || '').split(/\n\s*\n/).filter(Boolean).map(paragraph => `<p>${escape(paragraph.trim()).replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`).join('');
  }
  document.getElementById('preview-post').addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const post = getFormData();
    document.getElementById('preview-category').textContent = post.category;
    document.getElementById('preview-title').textContent = post.title;
    document.getElementById('preview-excerpt').textContent = post.excerpt;
    document.getElementById('preview-byline').textContent = `By ${post.author} · ${formatDate(post.date)} · ${post.readTime} min read`;
    const image = document.getElementById('preview-image');
    const selected = imageInput.files?.[0];
    const imageSrc = selected ? URL.createObjectURL(selected) : existingImage;
    image.src = imageSrc;
    image.alt = post.imageAlt;
    image.classList.toggle('visible', Boolean(imageSrc));
    document.getElementById('preview-body').innerHTML = markdownToPreview(post.body);
    const modal = document.getElementById('preview-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  });
  function closePreview() {
    document.getElementById('preview-modal').classList.remove('open');
    document.getElementById('preview-modal').setAttribute('aria-hidden', 'true');
  }
  document.querySelectorAll('[data-close-preview]').forEach(button => button.addEventListener('click', closePreview));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePreview(); });

  function saveDraft() {
    if (!form.reportValidity()) return;
    const draft = getFormData();
    delete draft.image;
    if (editingId) draft.originalId = editingId;
    if (activeAutomationDraftId) draft.automationDraftId = activeAutomationDraftId;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    document.getElementById('draft-state').textContent = 'Draft saved on this device';
    document.getElementById('save-draft').dataset.hasSavedDraft = 'false';
    document.getElementById('save-draft').textContent = 'Save as a draft';
    setToast('Draft saved in this browser.');
  }
  function loadSavedDraft() {
    let draft;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { draft = null; }
    if (!draft) return;
    clearComposer();
    editingId = draft.originalId || null;
    activeAutomationDraftId = draft.automationDraftId || null;
    activeAutomationMeta = draft.sourceUrl ? { sourceUrl: draft.sourceUrl, sourceName: draft.sourceName || 'Original publisher' } : null;
    if (activeAutomationMeta) {
      document.getElementById('automation-review-banner').hidden = false;
      document.getElementById('automation-source-link').href = sourceLink(activeAutomationMeta.sourceUrl);
      document.getElementById('automation-source-link').textContent = `Read original report from ${activeAutomationMeta.sourceName} ↗`;
      document.getElementById('publish-button').innerHTML = 'Approve & publish <span>↗</span>';
    }
    document.getElementById('post-title').value = draft.title || '';
    document.getElementById('post-excerpt').value = draft.excerpt || '';
    document.getElementById('post-category').value = draft.category || '';
    document.getElementById('post-author').value = draft.author || '';
    document.getElementById('post-date').value = draft.date || dateInputValue();
    document.getElementById('post-body').value = draft.body || '';
    document.getElementById('post-featured').checked = Boolean(draft.featured);
    document.getElementById('post-image-alt').value = draft.imageAlt || '';
    existingImage = editingId ? (posts.find(post => post.id === editingId)?.image || '') : '';
    if (existingImage) document.getElementById('cover-preview').innerHTML = `<img src="${escape(existingImage)}" alt="Current cover">`;
    document.getElementById('draft-state').textContent = 'Draft restored';
    document.getElementById('save-draft').dataset.hasSavedDraft = 'false';
    document.getElementById('save-draft').textContent = 'Save changes to draft';
    goTo('compose');
  }
  document.getElementById('save-draft').addEventListener('click', () => {
    if (document.getElementById('save-draft').dataset.hasSavedDraft === 'true') loadSavedDraft();
    else saveDraft();
  });
  function restoreDraft() {
    if (!localStorage.getItem(DRAFT_KEY)) return;
    const button = document.getElementById('save-draft');
    button.textContent = 'Load saved draft';
    button.dataset.hasSavedDraft = 'true';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!config?.owner || !config?.repo || !config?.token) {
      setToast('Connect GitHub before publishing.', true);
      goTo('connection');
      return;
    }
    const button = document.getElementById('publish-button');
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'Publishing…';
    document.getElementById('draft-state').textContent = 'Saving to your repository…';
    try {
      const post = getFormData();
      const completedAutomationDraftId = activeAutomationDraftId;
      const selected = imageInput.files?.[0];
      if (selected) {
        const extension = selected.type === 'image/jpeg' ? 'jpg' : selected.type === 'image/png' ? 'png' : 'webp';
        const imagePath = `assets/blog/${post.id}-${Date.now()}.${extension}`;
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('The cover image could not be read.'));
          reader.readAsDataURL(selected);
        });
        await uploadImage(imagePath, String(dataUrl).split(',')[1]);
        post.image = `./${imagePath}`;
      }
      if (!post.image && !editingId) throw new Error('Choose a cover image before publishing your first story.');
      let updated = [...posts];
      if (post.featured) updated = updated.map(existing => ({ ...existing, featured: false }));
      const position = updated.findIndex(existing => existing.id === post.id);
      if (position >= 0) updated[position] = post; else updated.unshift(post);
      updated.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      await writeGithubFile(FILE_PATH, `${JSON.stringify(updated, null, 2)}\n`, `${editingId ? 'Update' : 'Publish'} story: ${post.title}`);
      posts = updated;
      localStorage.removeItem(DRAFT_KEY);
      if (completedAutomationDraftId) {
        automationState = { ...automationState, drafts: automationState.drafts.filter(draft => draft.queueId !== completedAutomationDraftId) };
        saveAutomationState();
        renderAutomation();
      }
      renderPosts();
      clearComposer();
      goTo('overview');
      setToast('Your story is live in the journal.');
    } catch (error) {
      document.getElementById('draft-state').textContent = 'A small hiccup — your draft is still here';
      setToast(error.message || 'The story could not be published.', true);
    } finally {
      button.disabled = false;
      if (button.textContent === 'Publishing…') button.innerHTML = original;
    }
  });

  document.getElementById('connection-form').addEventListener('submit', async event => {
    event.preventDefault();
    const owner = document.getElementById('github-owner').value.trim();
    const repo = document.getElementById('github-repo').value.trim();
    const branch = document.getElementById('github-branch').value.trim() || 'main';
    const token = document.getElementById('github-token').value.trim() || config?.token || '';
    if (!token) { statusMessage('Add a fine-grained GitHub token to connect.', 'error'); return; }
    const previousConfig = config;
    config = { owner, repo, branch, token };
    const button = document.getElementById('connect-button');
    button.disabled = true;
    button.textContent = 'Checking repository…';
    statusMessage('Checking your repository and posts file…');
    try {
      await verifyOwner(token);
      await githubRequest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
      try { posts = await readGithubPosts(); }
      catch (error) {
        if (String(error.message).includes('not found')) throw new Error('Repository connected, but content/posts.json is missing. Add the website files to this repository and try again.');
        throw error;
      }
      try { categories = await readGithubCategories(); }
      catch { categories = await readLocalCategories(); }
      categories = [...new Set([...categories, ...posts.map(post => post.category).filter(Boolean)])];
      renderCategoryOptions();
      renderManagedCategories();
      renderPosts();
      populateConnectionFields();
      setConnectionUI(true);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      statusMessage(`Connected to ${owner}/${repo}. ${posts.length} stories found.`, 'success');
      setToast('GitHub connection is ready.');
      goTo('overview');
    } catch (error) {
      config = previousConfig;
      setConnectionUI(false);
      statusMessage(error.message, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = 'Save & test connection <span>↗</span>';
    }
  });
  document.getElementById('toggle-token').addEventListener('click', event => {
    const input = document.getElementById('github-token');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'HIDE' : 'SHOW';
  });
  document.getElementById('disconnect-button').addEventListener('click', () => {
    if (!window.confirm('Remove the saved GitHub connection from this browser?')) return;
    localStorage.removeItem(CONFIG_KEY);
    config = null;
    posts = [];
    showGate();
  });

  document.getElementById('toggle-auth-token').addEventListener('click', event => {
    const input = document.getElementById('owner-auth-token');
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    event.currentTarget.textContent = visible ? 'HIDE' : 'SHOW';
  });
  document.getElementById('owner-auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const tokenInput = document.getElementById('owner-auth-token');
    const token = tokenInput.value.trim() || config?.token || '';
    const submit = document.getElementById('owner-auth-submit');
    const feedback = document.getElementById('owner-auth-feedback');
    submit.disabled = true;
    submit.innerHTML = 'Checking GitHub… <span>↗</span>';
    feedback.textContent = '';
    feedback.className = 'gate-feedback';
    try {
      if (!token) throw new Error('For first use on this device, add a fine-grained GitHub token with Contents read and write.');
      await verifyOwner(token);
      config = { ...(config || {}), owner: config?.owner || DEFAULT_REPO_OWNER, repo: config?.repo || DEFAULT_REPO_NAME, branch: config?.branch || 'main', token };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      tokenInput.value = '';
      showShell();
      await loadDashboard();
    } catch (error) {
      feedback.textContent = error.message;
      feedback.className = 'gate-feedback';
      tokenInput.value = '';
      tokenInput.focus();
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Verify GitHub account <span>↗</span>';
    }
  });

  showGate();
})();
