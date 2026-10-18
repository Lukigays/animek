const SOURCE_URL = 'https://v2.samehadaku.how/';
const DAY_OPTIONS = [
  { key: 'all', label: 'Semua' },
  { key: 'monday', label: 'Senin' },
  { key: 'tuesday', label: 'Selasa' },
  { key: 'wednesday', label: 'Rabu' },
  { key: 'thursday', label: 'Kamis' },
  { key: 'friday', label: 'Jumat' },
  { key: 'saturday', label: 'Sabtu' },
  { key: 'sunday', label: 'Minggu' },
];
const DAY_KEY_BY_LABEL = Object.fromEntries(DAY_OPTIONS.slice(1).map((day) => [day.label.toLocaleLowerCase('id-ID'), day.key]));
const ROUTE_PATHS = { home: '/home', ongoing: '/ongoing', completed: '/tamat', schedule: '/jadwal' };
const ROUTE_LABELS = { home: 'Terbaru', ongoing: 'Sedang tayang', completed: 'Anime tamat', schedule: 'Jadwal rilis' };
const ROUTE_KICKERS = { home: 'LUKYY / FEED 01', ongoing: 'LUKYY / ONGOING 02', completed: 'LUKYY / ARCHIVE 03', schedule: 'LUKYY / AIRING BOARD 04' };

const elements = {
  dateStamp: document.getElementById('date-stamp'),
  pageTitle: document.getElementById('page-title'),
  titleCount: document.getElementById('title-count'),
  pageDescription: document.getElementById('page-description'),
  pageKicker: document.getElementById('page-kicker'),
  stampNumber: document.getElementById('stamp-number'),
  stampCaption: document.getElementById('stamp-caption'),
  sourceMode: document.getElementById('source-mode'),
  dayFilterWrap: document.getElementById('day-filter-wrap'),
  dayFilters: document.getElementById('day-filters'),
  sectionTitle: document.getElementById('section-title'),
  sectionKicker: document.getElementById('section-kicker'),
  recordCount: document.getElementById('record-count'),
  dataBadge: document.getElementById('data-badge'),
  cardsGrid: document.getElementById('cards-grid'),
  emptyState: document.getElementById('empty-state'),
  errorNote: document.getElementById('error-note'),
  sortSelect: document.getElementById('sort-select'),
  refreshButton: document.getElementById('refresh-button'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  primaryNav: document.getElementById('primary-nav'),
  mobileMenuButton: document.getElementById('mobile-menu-button'),
};

const state = {
  route: routeFromPath(),
  items: [],
  schedule: {},
  top: [],
  sourceMode: 'snapshot',
  updatedAt: '',
  selectedDay: 'all',
  searchQuery: new URLSearchParams(location.search).get('q') || '',
  sort: 'source',
  loading: false,
};

function routeFromPath() {
  const path = location.pathname.replace(/\/+$/, '') || '/home';
  if (path === '/ongoing') return 'ongoing';
  if (path === '/tamat') return 'completed';
  if (path === '/jadwal') return 'schedule';
  return 'home';
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function cleanText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function searchKey(value = '') {
  return cleanText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID').replace(/[^\p{L}\p{N}]+/gu, '');
}

function normalizeDay(value = '') {
  const label = cleanText(value).toLocaleLowerCase('id-ID');
  if (label === 'jumaat') return 'friday';
  return DAY_KEY_BY_LABEL[label] || '';
}

function routeToApiView(route) {
  if (route === 'completed') return 'completed';
  if (route === 'ongoing') return 'ongoing';
  if (route === 'schedule') return 'schedule';
  return state.searchQuery ? 'search' : 'latest';
}

function currentDateLabel() {
  try {
    return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date()).toLocaleUpperCase('id-ID');
  } catch {
    return new Date().toLocaleDateString('id-ID');
  }
}

function imageProxyUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    const allowed = url.protocol === 'https:' && (
      url.hostname === 'v2.samehadaku.how' || (/^i[0-3]\.wp\.com$/.test(url.hostname) && /samehadaku/i.test(url.pathname))
    );
    return allowed ? `/api/image?url=${encodeURIComponent(url.href)}` : '';
  } catch {
    return '';
  }
}

function formatScore(score) {
  if (score === null || score === undefined || score === '') return 'BARU';
  const value = Number(score);
  return Number.isFinite(value) ? value.toFixed(2) : escapeHTML(score);
}

function isCompleted(item) {
  return /completed|tamat|selesai/i.test(item.status || '');
}

function skeletonMarkup() {
  return Array.from({ length: 10 }, (_, index) => `
    <div class="skeleton-card" aria-hidden="true" style="animation-delay:${index * 35}ms">
      <div class="skeleton-poster"></div>
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
    </div>
  `).join('');
}

function setLoading(loading) {
  state.loading = loading;
  elements.cardsGrid.setAttribute('aria-busy', String(loading));
  elements.refreshButton.disabled = loading;
  elements.refreshButton.classList.toggle('is-refreshing', loading);
  if (loading && state.items.length === 0) elements.cardsGrid.innerHTML = skeletonMarkup();
}

function fallbackPayload(view, query, data) {
  const fallback = data;
  let items = fallback.latest || [];
  if (view === 'ongoing') items = fallback.ongoing || fallback.latest || [];
  if (view === 'completed') items = fallback.completed || [];
  if (view === 'schedule') items = Object.values(fallback.schedule || {}).flat();
  if (view === 'search') {
    const needle = searchKey(query);
    items = [...(fallback.latest || []), ...(fallback.completed || [])]
      .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
      .filter((item) => searchKey(item.title).includes(needle));
  }
  return {
    ok: true,
    items,
    total: items.length,
    schedule: fallback.schedule || {},
    top: fallback.top || [],
    sourceMode: 'snapshot',
    updatedAt: fallback.generatedAt || '',
    notice: 'Menampilkan snapshot metadata lokal karena API sedang tidak dapat dijangkau.',
  };
}

async function loadFallback(view, query) {
  const response = await fetch('/fallback.json', { cache: 'force-cache' });
  if (!response.ok) throw new Error('Fallback metadata tidak tersedia.');
  return fallbackPayload(view, query, await response.json());
}

async function loadData({ refresh = false } = {}) {
  const view = routeToApiView(state.route);
  const query = state.searchQuery;
  setLoading(true);
  elements.errorNote.hidden = true;
  try {
    const params = new URLSearchParams({ view });
    if (query && view === 'search') params.set('q', query);
    if (refresh) params.set('refresh', '1');
    const response = await fetch(`/api/anime?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`API merespons ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Gagal membaca data sumber.');
    state.items = Array.isArray(data.items) ? data.items : [];
    state.schedule = data.schedule || {};
    state.top = Array.isArray(data.top) ? data.top : [];
    state.sourceMode = data.sourceMode || 'snapshot';
    state.updatedAt = data.updatedAt || '';
    state.errorMessage = state.sourceMode === 'snapshot' ? data.notice : '';
  } catch (error) {
    try {
      const data = await loadFallback(view, query);
      state.items = data.items;
      state.schedule = data.schedule;
      state.top = data.top;
      state.sourceMode = 'snapshot';
      state.updatedAt = data.updatedAt;
      state.errorMessage = data.notice || error.message;
    } catch (fallbackError) {
      state.items = [];
      state.schedule = {};
      state.top = [];
      state.sourceMode = 'snapshot';
      state.errorMessage = fallbackError.message || error.message;
    }
  } finally {
    setLoading(false);
    render();
  }
}

function updateNav() {
  document.querySelectorAll('[data-route]').forEach((link) => {
    const route = link.dataset.route;
    link.classList.toggle('active', route === state.route);
    if (route === state.route && link.classList.contains('nav-link')) link.setAttribute('aria-current', 'page');
    else if (link.classList.contains('nav-link')) link.removeAttribute('aria-current');
  });
}

function renderDayFilters() {
  const visible = state.route === 'ongoing' || state.route === 'schedule';
  elements.dayFilterWrap.hidden = !visible;
  if (!visible) return;
  elements.dayFilters.innerHTML = DAY_OPTIONS.map((day) => `
    <button type="button" class="day-filter-button${state.selectedDay === day.key ? ' active' : ''}" data-day="${day.key}" aria-pressed="${state.selectedDay === day.key}">${day.label}</button>
  `).join('');
}

function getVisibleItems() {
  let items = [...state.items];
  if (state.route === 'schedule') {
    if (state.selectedDay === 'all') {
      items = Object.values(state.schedule).flat();
    } else {
      items = state.schedule[state.selectedDay] || [];
    }
  } else if (state.route === 'ongoing' && state.selectedDay !== 'all') {
    const selectedLabel = DAY_OPTIONS.find((day) => day.key === state.selectedDay)?.label;
    items = items.filter((item) => normalizeDay(item.day) === state.selectedDay || item.day === selectedLabel);
  }

  if (state.sort === 'rating') {
    items.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  } else if (state.sort === 'az') {
    items.sort((a, b) => a.title.localeCompare(b.title, 'id'));
  }
  return items;
}

function cardMarkup(item, index) {
  const completed = state.route === 'completed' || isCompleted(item);
  const scheduleMode = state.route === 'schedule';
  const episode = cleanText(item.episode);
  const statusText = completed ? 'COMPLETED' : (scheduleMode ? cleanText(item.day || 'JADWAL').toLocaleUpperCase('id-ID') : 'ONGOING');
  const href = item.href || SOURCE_URL;
  const episodeHref = item.episodeUrl || href;
  const image = imageProxyUrl(item.image);
  const rating = formatScore(item.score);
  const episodeLabel = episode ? `EP ${escapeHTML(episode)}` : (scheduleMode ? escapeHTML(item.time || 'JADWAL') : (completed ? 'TAMAT' : 'UPDATE'));
  const footText = scheduleMode
    ? `${escapeHTML(item.day || '')} · ${escapeHTML(item.time || 'Jadwal')}`
    : (completed ? (item.genres ? escapeHTML(item.genres) : 'KATALOG SELESAI') : [item.author ? `by ${item.author}` : '', item.released || ''].filter(Boolean).map(escapeHTML).join(' · ') || 'Episode terbaru');
  const genreLine = !scheduleMode && item.genres ? `<div class="card-genres">${escapeHTML(item.genres)}</div>` : '';
  const hasImage = Boolean(image);
  const animationDelay = Math.min(index * 24, 260);

  return `
    <article class="anime-card" style="animation-delay:${animationDelay}ms">
      <a class="poster-link${hasImage ? '' : ' no-image'}" href="${escapeHTML(scheduleMode ? href : episodeHref)}" target="_blank" rel="noopener noreferrer" aria-label="Buka ${escapeHTML(item.title)} di situs sumber">
        ${hasImage ? `<img class="poster-img" loading="lazy" src="${escapeHTML(image)}" alt="Poster ${escapeHTML(item.title)}" data-poster>` : ''}
        <span class="poster-index">NO. ${String(index + 1).padStart(2, '0')}</span>
        <span class="status-chip${completed ? ' completed' : ''}">${escapeHTML(statusText)}</span>
        <span class="poster-rating"><span class="rating-star">★</span> ${escapeHTML(rating)}</span>
        <span class="poster-episode"><span>${scheduleMode ? 'AIRING' : 'EPISODE'}</span><strong>${episodeLabel}</strong></span>
      </a>
      <div class="card-body">
        <div class="card-meta"><span class="rating-inline"><span class="rating-star">★</span>${escapeHTML(rating)}</span><span class="card-meta-type">${escapeHTML(item.type || 'TV')}</span></div>
        <h3 class="card-title"><a href="${escapeHTML(href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.title)}</a></h3>
        ${genreLine}
        <div class="card-foot"><span class="card-foot-text">${footText}</span><a class="card-open" href="${escapeHTML(scheduleMode ? href : episodeHref)}" target="_blank" rel="noopener noreferrer" aria-label="Buka sumber untuk ${escapeHTML(item.title)}">↗</a></div>
      </div>
    </article>
  `;
}

function titleForPage() {
  if (state.searchQuery) return `Hasil pencarian: ${state.searchQuery}`;
  if (state.route === 'ongoing') return 'Sedang tayang';
  if (state.route === 'completed') return 'Anime tamat';
  if (state.route === 'schedule') return 'Jadwal rilis';
  return 'Rilis terbaru';
}

function descriptionForPage() {
  if (state.searchQuery) return `Pencarian judul “${state.searchQuery}” dari katalog anime.`;
  if (state.route === 'ongoing') return 'Ikuti episode yang sedang tayang dan saring berdasarkan hari rilis.';
  if (state.route === 'completed') return 'Jelajahi anime berstatus selesai dari katalog publik.';
  if (state.route === 'schedule') return 'Papan jadwal mingguan anime berdasarkan hari penayangan.';
  return 'Episode paling baru, dikurasi langsung dari katalog anime.';
}

function kickerForPage() {
  if (state.searchQuery) return 'LUKYY / SEARCH RESULT';
  return ROUTE_KICKERS[state.route] || ROUTE_KICKERS.home;
}

function render() {
  const items = getVisibleItems();
  const title = titleForPage();
  const isSchedule = state.route === 'schedule';
  const isCompletedView = state.route === 'completed';
  elements.dateStamp.textContent = currentDateLabel();
  elements.pageTitle.childNodes[0].textContent = title;
  elements.pageTitle.setAttribute('aria-label', `${title}, ${items.length} judul`);
  elements.titleCount.textContent = isSchedule ? '07' : String(state.searchQuery ? items.length : state.items.length);
  elements.pageDescription.textContent = descriptionForPage();
  elements.pageKicker.textContent = kickerForPage();
  elements.sectionTitle.textContent = state.searchQuery ? 'Hasil pencarian' : ROUTE_LABELS[state.route] || 'Rilis terbaru';
  elements.sectionKicker.textContent = state.searchQuery ? 'SEARCH / RESULTS' : ({ home: '01 / LATEST DROPS', ongoing: '02 / ONGOING NOW', completed: '03 / COMPLETED ARCHIVE', schedule: '04 / WEEKLY AIRING' }[state.route] || '01 / LATEST DROPS');
  elements.stampNumber.textContent = isSchedule ? '07' : String(state.searchQuery ? items.length : state.items.length);
  elements.stampCaption.textContent = isSchedule ? 'HARI TAYANG' : (isCompletedView ? 'ANIME SELESAI' : 'UPDATE EPISODE');
  elements.sourceMode.textContent = state.sourceMode === 'live' ? 'SCRAPE AKTIF' : 'SNAPSHOT DATA';
  elements.recordCount.textContent = String(items.length).padStart(2, '0');
  elements.dataBadge.classList.toggle('snapshot', state.sourceMode !== 'live');
  elements.dataBadge.innerHTML = `<span class="live-dot"></span>${state.sourceMode === 'live' ? 'LIVE SCRAPE' : 'SNAPSHOT'}`;
  elements.errorNote.hidden = !state.errorMessage;
  elements.errorNote.textContent = state.errorMessage || '';
  elements.emptyState.hidden = items.length > 0;
  elements.cardsGrid.hidden = items.length === 0;
  elements.cardsGrid.innerHTML = items.map(cardMarkup).join('');
  elements.cardsGrid.setAttribute('aria-busy', 'false');
  document.querySelectorAll('[data-poster]').forEach((img) => {
    img.addEventListener('error', () => {
      const poster = img.closest('.poster-link');
      img.remove();
      poster?.classList.add('no-image');
    }, { once: true });
  });
  renderDayFilters();
  updateNav();
  if (state.searchQuery && document.activeElement !== elements.searchInput) elements.searchInput.value = state.searchQuery;
  if (!state.searchQuery && document.activeElement !== elements.searchInput) elements.searchInput.value = '';
  document.title = `${title} — LUKYY`;
}

function navigate(route, { push = true } = {}) {
  if (!ROUTE_PATHS[route]) route = 'home';
  state.route = route;
  state.searchQuery = '';
  state.selectedDay = 'all';
  elements.searchInput.value = '';
  if (push) history.pushState({ route }, '', ROUTE_PATHS[route]);
  elements.primaryNav.classList.remove('open');
  elements.mobileMenuButton.setAttribute('aria-expanded', 'false');
  loadData();
}

function search(query) {
  const value = cleanText(query);
  if (!value) {
    navigate('home');
    return;
  }
  state.route = 'home';
  state.searchQuery = value.slice(0, 80);
  state.selectedDay = 'all';
  history.pushState({ route: 'home', q: state.searchQuery }, '', `/home?q=${encodeURIComponent(state.searchQuery)}`);
  elements.primaryNav.classList.remove('open');
  elements.mobileMenuButton.setAttribute('aria-expanded', 'false');
  loadData();
}

document.querySelectorAll('[data-route]').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.dataset.route);
  });
});

elements.dayFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-day]');
  if (!button) return;
  state.selectedDay = button.dataset.day;
  render();
});

elements.sortSelect.addEventListener('change', () => {
  state.sort = elements.sortSelect.value;
  render();
});

elements.refreshButton.addEventListener('click', () => loadData({ refresh: true }));

elements.searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  search(elements.searchInput.value);
});

elements.emptyState.querySelector('#clear-filters').addEventListener('click', () => {
  if (state.searchQuery) navigate('home');
  else {
    state.selectedDay = 'all';
    render();
  }
});

elements.mobileMenuButton.addEventListener('click', () => {
  const open = elements.primaryNav.classList.toggle('open');
  elements.mobileMenuButton.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (event) => {
  if (!elements.primaryNav.classList.contains('open')) return;
  if (elements.primaryNav.contains(event.target) || elements.mobileMenuButton.contains(event.target)) return;
  elements.primaryNav.classList.remove('open');
  elements.mobileMenuButton.setAttribute('aria-expanded', 'false');
});

window.addEventListener('popstate', () => {
  state.route = routeFromPath();
  state.searchQuery = new URLSearchParams(location.search).get('q') || '';
  state.selectedDay = 'all';
  loadData();
});

document.getElementById('back-top').addEventListener('click', (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

if (state.searchQuery) elements.searchInput.value = state.searchQuery;
loadData();
