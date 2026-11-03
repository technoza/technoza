(() => {
  const content = document.getElementById('site-content');
  const grid = document.getElementById('story-grid');
  const searchPanel = document.querySelector('.search-panel');
  const searchInput = document.getElementById('search-input');
  const state = { posts: [], category: 'All stories', query: '' };
  const escape = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const formatDate = value => {
    if (!value) return 'A fresh story';
    const [year, month, day] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
  };
  const readingTime = post => post.readTime || Math.max(1, Math.ceil((post.body || '').split(/\s+/).filter(Boolean).length / 210));
  const articleBody = body => String(body || '').split(/\n\s*\n/).filter(Boolean).map(paragraph => {
    const safe = escape(paragraph.trim()).replace(/\n/g, '<br>');
    const decorated = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
    return `<p>${decorated}</p>`;
  }).join('');

  async function loadPosts() {
    try {
      const response = await fetch(`content/posts.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to read the stories file');
      const posts = await response.json();
      if (!Array.isArray(posts)) throw new Error('Stories should be a list');
      state.posts = posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    } catch (error) {
      console.warn('Could not load the journal stories.', error);
      state.posts = [];
    }
    const requested = new URLSearchParams(location.search).get('post');
    if (requested) renderArticle(state.posts.find(post => post.id === requested));
    else renderHome();
  }

  function renderHome() {
    searchButton.hidden = false;
    const feature = state.posts.find(post => post.featured) || state.posts[0];
    if (feature) {
      const image = document.getElementById('hero-image');
      image.src = feature.image || image.src;
      image.alt = feature.imageAlt || feature.title;
      document.getElementById('hero-category').textContent = String(feature.category || 'THE JOURNAL').toUpperCase();
      document.getElementById('hero-title').textContent = feature.title;
      document.getElementById('hero-feature').href = `?post=${encodeURIComponent(feature.id)}`;
    }
    renderCategories();
    renderCards();
    loadNews();
    document.getElementById('year').textContent = new Date().getFullYear();
    watchReveals();
  }

  function renderCategories() {
    const host = document.getElementById('category-row');
    if (!host) return;
    const categories = ['All stories', ...new Set(state.posts.map(post => post.category).filter(Boolean))];
    host.innerHTML = `<span class="category-label">BROWSE BY</span>${categories.map(category => `<button class="category-button${state.category === category ? ' active' : ''}" type="button" data-category="${escape(category)}">${escape(category)}</button>`).join('')}`;
    host.querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
      state.category = button.dataset.category;
      renderCategories();
      renderCards();
    }));
  }

  function renderCards() {
    if (!document.getElementById('story-grid')) return;
    const normalized = state.query.toLowerCase().trim();
    const posts = state.posts.filter(post => (state.category === 'All stories' || post.category === state.category) && (!normalized || `${post.title} ${post.excerpt} ${post.category} ${post.author} ${post.body}`.toLowerCase().includes(normalized)));
    grid.innerHTML = posts.map((post, index) => `<article class="story-card" style="--card-index:${index}">
      <a class="card-image" href="?post=${encodeURIComponent(post.id)}" aria-label="Read ${escape(post.title)}"><img loading="lazy" src="${escape(post.image || '')}" alt="${escape(post.imageAlt || post.title)}"><span class="card-category">${escape(post.category || 'Journal')}</span></a>
      <div class="card-body"><div class="card-meta"><span>${escape(formatDate(post.date))}</span><span class="meta-dot"></span><span>${readingTime(post)} min read</span></div><h3 class="card-title"><a href="?post=${encodeURIComponent(post.id)}">${escape(post.title)}</a></h3><p class="card-excerpt">${escape(post.excerpt || '')}</p><div class="card-footer"><span>By ${escape(post.author || 'Margin Editors')}</span><a href="?post=${encodeURIComponent(post.id)}">Read story&nbsp; ↗</a></div></div>
    </article>`).join('');
    document.getElementById('empty-state').hidden = posts.length > 0;
  }

  const safeNewsUrl = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };
  const formatNewsDate = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-IN', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(date);
  };

  async function loadNews() {
    const host = document.getElementById('news-grid');
    const updated = document.getElementById('news-updated');
    if (!host || !updated) return;
    try {
      const response = await fetch(`content/news.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Unable to read the news file');
      const data = await response.json();
      const articles = Array.isArray(data.articles) ? data.articles.slice(0, 10) : [];
      updated.textContent = data.updatedAt ? `Updated ${formatNewsDate(data.updatedAt)} IST` : 'Updated daily';
      if (!articles.length) {
        host.innerHTML = '<article class="news-loading"><span class="news-pulse" aria-hidden="true"></span><p>Today’s brief is being prepared. Check back soon.</p></article>';
        return;
      }
      host.innerHTML = articles.map((article, index) => {
        const link = safeNewsUrl(article.url);
        const image = safeNewsUrl(article.image);
        const source = escape(article.source || 'Original publisher');
        const published = formatNewsDate(article.publishedAt);
        return `<article class="news-card reveal" style="--card-index:${index}">
          ${image && link ? `<a class="news-image" href="${link}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img loading="lazy" src="${image}" alt=""></a>` : '<div class="news-image news-image-empty" aria-hidden="true"><span>✳</span></div>'}
          <div class="news-card-body"><div class="news-card-meta"><span>${source}</span>${published ? `<span>${escape(published)}</span>` : ''}</div>
          <h3>${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">${escape(article.title || 'Read the latest story')} <span aria-hidden="true">↗</span></a>` : escape(article.title || 'Latest story')}</h3>
          ${article.description ? `<p>${escape(article.description)}</p>` : ''}
          ${link ? `<a class="news-read-link" href="${link}" target="_blank" rel="noopener noreferrer">Read at ${source} <span aria-hidden="true">↗</span></a>` : ''}</div>
        </article>`;
      }).join('');
      watchReveals();
    } catch (error) {
      console.warn('Could not load today’s news brief.', error);
      updated.textContent = 'Daily news brief';
      host.innerHTML = '<article class="news-loading"><span>✳</span><p>The latest brief will appear here once it is ready.</p></article>';
    }
  }

  function renderArticle(post) {
    searchButton.hidden = true;
    if (!post) {
      content.innerHTML = `<section class="article-view"><a class="article-back" href="./#stories"><span>←</span> Back to the journal</a><div class="empty-state"><span>✳</span><h3>We couldn't find that story.</h3><p>It may have moved, or the link may be out of date.</p></div></section>`;
      return;
    }
    document.title = `${post.title} — Margin`;
    const article = document.createElement('article');
    article.className = 'article-view';
    const previous = state.posts[state.posts.indexOf(post) + 1];
    const next = state.posts[state.posts.indexOf(post) - 1];
    const sourceUrl = safeNewsUrl(post.sourceUrl);
    const sourceAttribution = sourceUrl ? `<aside class="article-source"><span>Reporting source</span><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">${escape(post.sourceName || 'Original publisher')} ↗</a></aside>` : '';
    article.innerHTML = `<a class="article-back" href="./#stories"><span>←</span> Back to the journal</a>
      <header class="article-header"><div class="eyebrow"><span class="eyebrow-line"></span>${escape(post.category || 'The Journal')}<span class="eyebrow-line"></span></div><h1>${escape(post.title)}</h1><p class="article-excerpt">${escape(post.excerpt || '')}</p><div class="article-byline">By ${escape(post.author || 'Margin Editors')} &nbsp; · &nbsp; ${escape(formatDate(post.date))} &nbsp; · &nbsp; ${readingTime(post)} min read</div></header>
      <img class="article-cover" src="${escape(post.image || '')}" alt="${escape(post.imageAlt || post.title)}">
      <div class="article-body">${articleBody(post.body)}</div>${sourceAttribution}<div class="article-end">✳</div>
      <nav class="article-nav" aria-label="More stories">${previous ? `<a href="?post=${encodeURIComponent(previous.id)}">← Earlier story</a>` : '<span></span>'}${next ? `<a href="?post=${encodeURIComponent(next.id)}">Newer story →</a>` : '<span></span>'}</nav>`;
    content.replaceChildren(article);
  }

  function watchReveals() {
    const nodes = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) { nodes.forEach(node => node.classList.add('is-visible')); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), { threshold: 0.12 });
    nodes.forEach(node => observer.observe(node));
  }

  const searchButton = document.querySelector('.search-trigger');
  const closeSearch = document.querySelector('.search-close');
  searchButton.addEventListener('click', () => {
    const open = !searchPanel.classList.contains('is-open');
    searchPanel.classList.toggle('is-open', open);
    searchPanel.setAttribute('aria-hidden', String(!open));
    if (open) searchInput.focus(); else { searchInput.value = ''; state.query = ''; renderCards(); }
  });
  closeSearch.addEventListener('click', () => { searchPanel.classList.remove('is-open'); searchPanel.setAttribute('aria-hidden', 'true'); searchInput.value = ''; state.query = ''; renderCards(); });
  searchInput.addEventListener('input', () => { state.query = searchInput.value; state.category = 'All stories'; renderCategories(); renderCards(); });
  document.querySelector('.menu-toggle').addEventListener('click', event => {
    const button = event.currentTarget;
    const open = button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(open));
    document.querySelector('.main-nav').classList.toggle('is-open', open);
  });
  document.querySelectorAll('.main-nav a').forEach(link => link.addEventListener('click', () => {
    document.querySelector('.main-nav').classList.remove('is-open');
    document.querySelector('.menu-toggle').setAttribute('aria-expanded', 'false');
  }));
  loadPosts();
})();
