// CampusCare Companion - Main JS

(function () {
  const STORAGE_KEYS = {
    MOODS: 'ccc_moods',
    JOURNAL_ENTRIES: 'ccc_journal_entries',
    WELLNESS_PLAN: 'ccc_wellness_plan',
    PEER_QUEUE: 'ccc_peer_queue',
    PEER_CHAT: 'ccc_peer_chat',
    COMFORT_MESSAGES: 'ccc_comfort_messages',
    DARK_MODE: 'ccc_dark_mode',
    ONBOARDING_DONE: 'ccc_onboarding_done',
  };
  const ENTRY_TYPES = {
    MOOD: 'mood',
    JOURNAL: 'journal',
    COMFORT: 'comfort',
  };

  // Utility: localStorage helpers
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse storage for', key, e);
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('Failed to save storage for', key, e);
    }
  }

  function createLocalId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function getLocalKeyForType(type) {
    if (type === ENTRY_TYPES.MOOD) return STORAGE_KEYS.MOODS;
    if (type === ENTRY_TYPES.JOURNAL) return STORAGE_KEYS.JOURNAL_ENTRIES;
    return STORAGE_KEYS.COMFORT_MESSAGES;
  }

  function normalizeLocalEntry(type, entry) {
    const normalized = { ...entry };
    if (!normalized.id) normalized.id = createLocalId();
    if (!normalized.updatedAt) {
      normalized.updatedAt =
        normalized.timestamp || normalized.createdAt || normalized.syncedAt || new Date().toISOString();
    }
    if (type === ENTRY_TYPES.MOOD && !normalized.dateKey && normalized.timestamp) {
      const sourceDate = new Date(normalized.timestamp);
      const year = sourceDate.getFullYear();
      const month = String(sourceDate.getMonth() + 1).padStart(2, '0');
      const day = String(sourceDate.getDate()).padStart(2, '0');
      normalized.dateKey = `${year}-${month}-${day}`;
    }
    return normalized;
  }

  function ensureIdsForType(type) {
    const key = getLocalKeyForType(type);
    const current = loadJSON(key, []);
    let changed = false;
    const normalized = current.map((entry) => {
      const next = normalizeLocalEntry(type, entry);
      if (!entry.id || !entry.updatedAt || (type === ENTRY_TYPES.MOOD && !entry.dateKey && entry.timestamp)) {
        changed = true;
      }
      return next;
    });
    if (changed) {
      saveJSON(key, normalized);
    }
    return normalized;
  }

  // ==== SPA Navigation ====
  const views = document.querySelectorAll('.view');
  const navButtons = document.querySelectorAll('[data-target]');
  const nav = document.querySelector('.nav');
  const navToggle = document.getElementById('navToggle');
  const authStatus = document.getElementById('authStatus');
  const authButton = document.getElementById('authButton');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const syncStatusText = document.getElementById('syncStatusText');
  const greetingText = document.getElementById('greetingText');
  const emotionRow = document.getElementById('emotionRow');
  const dailyWellnessPlan = document.getElementById('dailyWellnessPlan');
  const dashboardHeatmap = document.getElementById('dashboardHeatmap');
  const supportFab = document.getElementById('supportFab');
  const supportMenu = document.getElementById('supportMenu');
  const supportEmergencyBtn = document.getElementById('supportEmergencyBtn');
  const authModal = document.getElementById('authModal');
  const closeAuthModal = document.getElementById('closeAuthModal');
  const authForm = document.getElementById('authForm');
  const authEmailInput = document.getElementById('authEmailInput');
  const authPasswordInput = document.getElementById('authPasswordInput');
  const signUpSubmitBtn = document.getElementById('signUpSubmitBtn');
  const authFeedback = document.getElementById('authFeedback');

  const VIEW_ORDER = ['dashboard', 'mood', 'crisis', 'peer', 'breathing', 'wellness'];
  const CLOUD_CONFIG = window.CAMPUSCARE_CONFIG || {};
  const cloudEnabled = Boolean(window.supabase && CLOUD_CONFIG.supabaseUrl && CLOUD_CONFIG.supabaseAnonKey);
  const cloudClient = cloudEnabled
    ? window.supabase.createClient(CLOUD_CONFIG.supabaseUrl, CLOUD_CONFIG.supabaseAnonKey)
    : null;
  let currentUser = null;
  let isSyncing = false;

  let currentViewId = 'dashboard';
  const initialActiveView = document.querySelector('.view.active-view');
  if (initialActiveView && initialActiveView.id) {
    currentViewId = initialActiveView.id;
  }

  function setSyncStatus(message, isError) {
    if (!syncStatusText) return;
    syncStatusText.textContent = message || '';
    syncStatusText.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
  }

  function updateAuthUI() {
    if (!authStatus || !authButton || !syncNowBtn) return;
    if (!cloudEnabled) {
      authStatus.textContent = 'Local mode';
      authButton.textContent = 'Setup Cloud';
      syncNowBtn.disabled = true;
      return;
    }
    if (currentUser) {
      authStatus.textContent = currentUser.email || 'Signed in';
      authButton.textContent = 'Sign Out';
      syncNowBtn.disabled = false;
    } else {
      authStatus.textContent = 'Local mode';
      authButton.textContent = 'Sign In';
      syncNowBtn.disabled = true;
    }
  }

  function openAuthModal() {
    if (!authModal) return;
    authModal.classList.remove('hidden');
  }

  function closeAuthModalUI() {
    if (!authModal) return;
    authModal.classList.add('hidden');
  }

  function syncActiveNavigation() {
    navButtons.forEach((btn) => {
      const target = btn.getAttribute('data-target');
      const isActive = target === currentViewId;
      btn.classList.toggle('active-nav', isActive);
      if (btn.classList.contains('nav-link')) {
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      }
    });
  }

  function showView(id) {
    if (!id || id === currentViewId) return;
    const currentEl = document.getElementById(currentViewId);
    const nextEl = document.getElementById(id);
    if (!nextEl) return;

    if (currentEl) {
      currentEl.classList.add('fade-out');
      setTimeout(() => {
        currentEl.classList.remove('fade-out');
        currentEl.classList.remove('active-view');
      }, 150);
    }

    nextEl.classList.add('active-view');
    currentViewId = id;
    syncActiveNavigation();
    if (id === 'mood') {
      renderMoodTrendChart();
    }
  }

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      if (target) showView(target);
      if (nav && nav.classList.contains('open')) {
        nav.classList.remove('open');
      }
      if (supportMenu && !supportMenu.classList.contains('hidden')) {
        supportMenu.classList.add('hidden');
      }
    });
  });

  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  syncActiveNavigation();

  if (closeAuthModal) {
    closeAuthModal.addEventListener('click', closeAuthModalUI);
  }

  if (authButton) {
    authButton.addEventListener('click', async () => {
      if (!cloudEnabled) {
        setSyncStatus('Add Supabase keys in config.js to enable cloud sync.', true);
        return;
      }
      if (currentUser) {
        try {
          await signOutCloud();
        } catch (error) {
          console.error('Failed to sign out', error);
          setSyncStatus('Sign out failed. Try again.', true);
        }
      } else {
        openAuthModal();
      }
    });
  }

  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => {
      runCloudSync('manual').catch((error) => {
        console.error('Manual sync failed', error);
      });
    });
  }

  if (supportFab && supportMenu) {
    supportFab.addEventListener('click', () => {
      supportMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (supportFab.contains(target) || supportMenu.contains(target)) return;
      supportMenu.classList.add('hidden');
    });
  }

  if (supportEmergencyBtn) {
    supportEmergencyBtn.addEventListener('click', () => {
      if (supportMenu) supportMenu.classList.add('hidden');
      openEmergencyModal();
    });
  }

  if (authForm && authEmailInput && authPasswordInput) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = authEmailInput.value.trim();
      const password = authPasswordInput.value.trim();
      if (!email || !password) return;
      try {
        await signInWithEmail(email, password);
        if (authFeedback) authFeedback.textContent = '';
        closeAuthModalUI();
      } catch (error) {
        console.error('Sign in failed', error);
        if (authFeedback) authFeedback.textContent = 'Sign in failed. Check your email/password.';
      }
    });
  }

  if (signUpSubmitBtn && authEmailInput && authPasswordInput) {
    signUpSubmitBtn.addEventListener('click', async () => {
      const email = authEmailInput.value.trim();
      const password = authPasswordInput.value.trim();
      if (!email || !password) {
        if (authFeedback) authFeedback.textContent = 'Enter email and password first.';
        return;
      }
      try {
        await signUpWithEmail(email, password);
        if (authFeedback) authFeedback.textContent = 'Account created. Check your email confirmation if prompted.';
      } catch (error) {
        console.error('Sign up failed', error);
        if (authFeedback) authFeedback.textContent = 'Sign up failed. Try a different email.';
      }
    });
  }

  // Swipe gestures for mobile
  let touchStartX = null;
  let touchStartY = null;

  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (touchStartX === null || touchStartY === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;

    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;

    const currentIndex = VIEW_ORDER.indexOf(currentViewId);
    if (currentIndex === -1) return;

    if (dx < 0 && currentIndex < VIEW_ORDER.length - 1) {
      showView(VIEW_ORDER[currentIndex + 1]);
    } else if (dx > 0 && currentIndex > 0) {
      showView(VIEW_ORDER[currentIndex - 1]);
    }
  }, { passive: true });

  // ==== Dark Mode ====
  const darkToggle = document.getElementById('darkModeToggle');

  function applyDarkModeSetting() {
    const enabled = loadJSON(STORAGE_KEYS.DARK_MODE, false);
    if (enabled) {
      document.body.classList.add('dark');
      darkToggle.textContent = 'Light Mode';
    } else {
      document.body.classList.remove('dark');
      darkToggle.textContent = 'Dark Mode';
    }
  }

  applyDarkModeSetting();

  darkToggle.addEventListener('click', () => {
    const current = loadJSON(STORAGE_KEYS.DARK_MODE, false);
    saveJSON(STORAGE_KEYS.DARK_MODE, !current);
    applyDarkModeSetting();
  });

  // ==== Motivational Quote of the Day ====
  const quotes = [
    { text: "You are enough, exactly as you are today.", author: "Unknown" },
    { text: "One small step is still a step forward.", author: "Unknown" },
    { text: "Your feelings are valid. Your story matters.", author: "Unknown" },
    { text: "You have survived 100% of your hardest days.", author: "Unknown" },
    { text: "Rest is productive too.", author: "Unknown" },
    { text: "It's okay to ask for help. We all need it.", author: "Unknown" },
    { text: "You don't have to do it all today.", author: "Unknown" },
    { text: "You are loved more than you know.", author: "Unknown" },
    { text: "The fact that you're here means you haven't given up.", author: "Unknown" },
    { text: "Your pace is the right pace.", author: "Unknown" },
  ];

  const quoteText = document.getElementById('quoteText');
  const quoteAuthor = document.getElementById('quoteAuthor');

  function renderQuoteOfTheDay() {
    const today = new Date();
    const index = today.getDate() % quotes.length;
    const quote = quotes[index];
    if (quoteText) quoteText.textContent = `"${quote.text}"`;
    if (quoteAuthor) quoteAuthor.textContent = `— ${quote.author}`;
  }

  renderQuoteOfTheDay();

  function renderGreeting() {
    if (!greetingText) return;
    const hour = new Date().getHours();
    let salutation = 'Good Evening';
    if (hour < 12) salutation = 'Good Morning';
    else if (hour < 17) salutation = 'Good Afternoon';
    greetingText.textContent = `${salutation} 👋`;
  }

  renderGreeting();

  // ==== Mood Tracking ====
  const moodSlider = document.getElementById('moodSlider');
  const moodValueLabel = document.getElementById('moodValue');
  const energySelect = document.getElementById('energySelect');
  const stressSelect = document.getElementById('stressSelect');
  const moodForm = document.getElementById('moodForm');
  const moodNoteInput = document.getElementById('moodNoteInput');
  const moodInsight = document.getElementById('moodInsight');
  const todayMoodStatus = document.getElementById('todayMoodStatus');
  const progressSnapshot = document.getElementById('progressSnapshot');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const moodHeatmap = document.getElementById('moodHeatmap');
  const moodTrendCanvas = document.getElementById('moodTrendChart');
  const moodDayDetails = document.getElementById('moodDayDetails');

  let moodTrendChart;

  function getMoodDescriptor(mood) {
    const m = Number(mood) || 0;
    if (m <= 2) return { emoji: '😢', label: 'Very Low' };
    if (m <= 4) return { emoji: '😔', label: 'Low' };
    if (m <= 6) return { emoji: '😐', label: 'Steady' };
    if (m <= 8) return { emoji: '🙂', label: 'Calm' };
    return { emoji: '😀', label: 'Great' };
  }

  function getEnergyVisual(energy) {
    if (energy === 'Low') return '⚡ Low';
    if (energy === 'High') return '⚡ High';
    return '⚡ Medium';
  }

  function getStressVisual(stress) {
    if (stress === 'Low') return '🌤 Low';
    if (stress === 'High') return '🌧 High';
    return '🌥 Medium';
  }

  function getMoodEmoji(mood) {
    const m = Number(mood) || 0;
    if (m <= 3) return '😢';
    if (m <= 7) return '😐';
    return '😊';
  }

  function updateMoodSliderVisual(value) {
    if (!moodSlider) return;
    const v = Number(value);
    const percentage = ((v - 1) / 9) * 100;
    moodSlider.style.background = `linear-gradient(to right, var(--blue) ${percentage}%, var(--neutral-dark) ${percentage}%)`;
  }

  if (moodSlider && moodValueLabel) {
    moodValueLabel.textContent = moodSlider.value;
    updateMoodSliderVisual(moodSlider.value);
    moodSlider.addEventListener('input', () => {
      moodValueLabel.textContent = moodSlider.value;
      updateMoodSliderVisual(moodSlider.value);
    });
  }

  if (emotionRow) {
    emotionRow.addEventListener('click', (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const moodValue = target.getAttribute('data-mood-value');
      if (!moodValue) return;
      if (moodSlider) {
        moodSlider.value = moodValue;
        if (moodValueLabel) moodValueLabel.textContent = moodValue;
        updateMoodSliderVisual(moodValue);
      }
      showView('mood');
    });
  }

  function getTodayKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getAllEntriesByType(type) {
    const key = getLocalKeyForType(type);
    const entries = loadJSON(key, []);
    return entries.map((entry) => normalizeLocalEntry(type, entry));
  }

  function saveAllEntriesByType(type, entries) {
    const key = getLocalKeyForType(type);
    const normalized = entries.map((entry) => normalizeLocalEntry(type, entry));
    saveJSON(key, normalized);
  }

  function mergeByLatest(localEntries, cloudEntries, type) {
    const mergedMap = new Map();
    [...localEntries, ...cloudEntries].forEach((entry) => {
      const normalized = normalizeLocalEntry(type, entry);
      const existing = mergedMap.get(normalized.id);
      if (!existing) {
        mergedMap.set(normalized.id, normalized);
        return;
      }
      const existingTime = new Date(existing.updatedAt || existing.timestamp || existing.createdAt || 0).getTime();
      const currentTime = new Date(
        normalized.updatedAt || normalized.timestamp || normalized.createdAt || 0
      ).getTime();
      if (currentTime >= existingTime) {
        mergedMap.set(normalized.id, normalized);
      }
    });
    return [...mergedMap.values()].sort((a, b) => {
      const aTime = new Date(a.timestamp || a.createdAt || a.updatedAt || 0).getTime();
      const bTime = new Date(b.timestamp || b.createdAt || b.updatedAt || 0).getTime();
      return aTime - bTime;
    });
  }

  async function upsertEntryToCloud(type, entry) {
    if (!cloudClient || !currentUser) return;
    const normalized = normalizeLocalEntry(type, entry);
    const { error } = await cloudClient.from('user_entries').upsert(
      {
        user_id: currentUser.id,
        entry_type: type,
        entry_id: normalized.id,
        payload: normalized,
        updated_at: normalized.updatedAt,
      },
      { onConflict: 'user_id,entry_type,entry_id' }
    );
    if (error) throw error;
  }

  async function pushLocalEntriesToCloud() {
    if (!cloudClient || !currentUser) return;
    const rows = [];
    [ENTRY_TYPES.MOOD, ENTRY_TYPES.JOURNAL, ENTRY_TYPES.COMFORT].forEach((type) => {
      const items = getAllEntriesByType(type);
      items.forEach((entry) => {
        rows.push({
          user_id: currentUser.id,
          entry_type: type,
          entry_id: entry.id,
          payload: entry,
          updated_at: entry.updatedAt,
        });
      });
    });
    if (!rows.length) return;
    const { error } = await cloudClient.from('user_entries').upsert(rows, {
      onConflict: 'user_id,entry_type,entry_id',
    });
    if (error) throw error;
  }

  async function pullCloudEntries() {
    if (!cloudClient || !currentUser) return;
    const { data, error } = await cloudClient
      .from('user_entries')
      .select('entry_type, entry_id, payload, updated_at')
      .eq('user_id', currentUser.id);
    if (error) throw error;

    const grouped = {
      [ENTRY_TYPES.MOOD]: [],
      [ENTRY_TYPES.JOURNAL]: [],
      [ENTRY_TYPES.COMFORT]: [],
    };
    (data || []).forEach((row) => {
      const type = row.entry_type;
      if (!grouped[type]) return;
      const payload = {
        ...(row.payload || {}),
        id: row.entry_id,
        updatedAt: row.updated_at || (row.payload && row.payload.updatedAt) || new Date().toISOString(),
      };
      grouped[type].push(payload);
    });

    Object.keys(grouped).forEach((type) => {
      const localEntries = getAllEntriesByType(type);
      const merged = mergeByLatest(localEntries, grouped[type], type);
      saveAllEntriesByType(type, merged);
    });
  }

  async function runCloudSync(reason) {
    if (!cloudEnabled || !currentUser || isSyncing) return;
    isSyncing = true;
    setSyncStatus(reason ? `Syncing (${reason})...` : 'Syncing...', false);
    try {
      ensureIdsForType(ENTRY_TYPES.MOOD);
      ensureIdsForType(ENTRY_TYPES.JOURNAL);
      ensureIdsForType(ENTRY_TYPES.COMFORT);
      await pushLocalEntriesToCloud();
      await pullCloudEntries();
      setSyncStatus(`Synced at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`, false);
      renderTodayMoodStatus();
      renderMoodHeatmap();
      renderDashboardHeatmap();
      if (currentViewId === 'mood') renderMoodTrendChart();
      renderProgressSnapshot();
      renderDailyWellnessPlan();
      renderJournalHistory();
      renderComfortMessages();
    } catch (error) {
      console.error('Cloud sync failed', error);
      setSyncStatus('Sync failed. Check backend setup.', true);
    } finally {
      isSyncing = false;
    }
  }

  async function signInWithEmail(email, password) {
    if (!cloudClient) return;
    const { error } = await cloudClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUpWithEmail(email, password) {
    if (!cloudClient) return;
    const { error } = await cloudClient.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signOutCloud() {
    if (!cloudClient) return;
    const { error } = await cloudClient.auth.signOut();
    if (error) throw error;
  }

  async function initializeCloudAuth() {
    ensureIdsForType(ENTRY_TYPES.MOOD);
    ensureIdsForType(ENTRY_TYPES.JOURNAL);
    ensureIdsForType(ENTRY_TYPES.COMFORT);
    updateAuthUI();
    if (!cloudEnabled) {
      setSyncStatus('Cloud sync not configured yet.', false);
      return;
    }

    const { data } = await cloudClient.auth.getSession();
    currentUser = data && data.session && data.session.user ? data.session.user : null;
    updateAuthUI();
    if (currentUser) {
      await runCloudSync('session restore');
    } else {
      setSyncStatus('Sign in to enable cloud backup.', false);
    }

    cloudClient.auth.onAuthStateChange(async (_event, session) => {
      currentUser = session && session.user ? session.user : null;
      updateAuthUI();
      if (currentUser) {
        await runCloudSync('login');
      } else {
        setSyncStatus('Signed out. Local mode active.', false);
      }
    });
  }

  function loadMoods() {
    return getAllEntriesByType(ENTRY_TYPES.MOOD);
  }

  function saveMoodEntry(entry) {
    const moods = loadMoods();
    const normalized = normalizeLocalEntry(ENTRY_TYPES.MOOD, entry);
    moods.push(normalized);
    saveJSON(STORAGE_KEYS.MOODS, moods);
    upsertEntryToCloud(ENTRY_TYPES.MOOD, normalized).catch((error) => {
      console.error('Failed to sync mood entry', error);
    });
  }

  function getLatestMoodForDay(dayKey) {
    const moods = loadMoods();
    const byDay = new Map();
    moods.forEach((entry) => {
      if (!entry.dateKey) return;
      const existing = byDay.get(entry.dateKey);
      if (!existing) {
        byDay.set(entry.dateKey, entry);
        return;
      }
      const existingTime = new Date(existing.timestamp || existing.updatedAt || 0).getTime();
      const currentTime = new Date(entry.timestamp || entry.updatedAt || 0).getTime();
      if (currentTime >= existingTime) {
        byDay.set(entry.dateKey, entry);
      }
    });
    return byDay.get(dayKey) || null;
  }

  function renderTodayMoodStatus() {
    if (!todayMoodStatus) return;
    const todayKey = getTodayKey(new Date());
    const latest = getLatestMoodForDay(todayKey);
    if (!latest) {
      todayMoodStatus.innerHTML = `
        <p>No check-in yet. How are you feeling today?</p>
        <button class="primary-btn" data-target="mood">Check in now</button>
      `;
      const btn = todayMoodStatus.querySelector('button[data-target="mood"]');
      if (btn) {
        btn.addEventListener('click', () => showView('mood'));
      }
      return;
    }

    const moodDescriptor = getMoodDescriptor(latest.mood);

    todayMoodStatus.innerHTML = `
      <p>Mood: <strong>${moodDescriptor.emoji} ${moodDescriptor.label}</strong></p>
      <p>Energy: <strong>${getEnergyVisual(latest.energy)}</strong></p>
      <p>Stress: <strong>${getStressVisual(latest.stress)}</strong></p>
      ${latest.note ? `<p>Note: <strong>${latest.note}</strong></p>` : ''}
      <p style="font-size:0.85rem;color:var(--text-muted);">Last updated at ${new Date(
        latest.timestamp
      ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
    `;
  }

  function getMoodStats() {
    const moods = loadMoods();
    if (!moods.length) {
      return { total: 0, average7Day: null, streak: 0 };
    }

    const sorted = [...moods].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const latestByDay = new Map();
    sorted.forEach((entry) => latestByDay.set(entry.dateKey, entry));

    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getTodayKey(d);
      if (latestByDay.has(key)) streak += 1;
      else break;
    }

    let sum7Day = 0;
    let count7Day = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getTodayKey(d);
      const entry = latestByDay.get(key);
      if (entry) {
        sum7Day += Number(entry.mood) || 0;
        count7Day += 1;
      }
    }

    return {
      total: latestByDay.size,
      average7Day: count7Day ? sum7Day / count7Day : null,
      streak,
    };
  }

  function renderProgressSnapshot() {
    if (!progressSnapshot) return;
    const stats = getMoodStats();
    if (!stats.total) {
      progressSnapshot.innerHTML = '<p class="feedback-text">Start with your first check-in to unlock insights.</p>';
      return;
    }
    progressSnapshot.innerHTML = `
      <div class="snapshot-row"><span>Current streak</span><strong>${stats.streak} day${stats.streak === 1 ? '' : 's'}</strong></div>
      <div class="snapshot-row"><span>7-day mood average</span><strong>${stats.average7Day ? stats.average7Day.toFixed(1) : 'N/A'}/10</strong></div>
      <div class="snapshot-row"><span>Total check-in days</span><strong>${stats.total}</strong></div>
    `;
  }

  function getTodayWellnessPlan() {
    const todayKey = getTodayKey(new Date());
    const stored = loadJSON(STORAGE_KEYS.WELLNESS_PLAN, null);
    if (stored && stored.dateKey === todayKey && Array.isArray(stored.tasks)) {
      return stored;
    }
    const fresh = {
      dateKey: todayKey,
      tasks: [
        { id: 'water', label: 'Drink water', completed: false },
        { id: 'breathing', label: '5 minute breathing', completed: false },
        { id: 'gratitude', label: 'Write 3 gratitudes', completed: false },
        { id: 'walk', label: 'Go for a short walk', completed: false },
      ],
    };
    saveJSON(STORAGE_KEYS.WELLNESS_PLAN, fresh);
    return fresh;
  }

  function renderDailyWellnessPlan() {
    if (!dailyWellnessPlan) return;
    const plan = getTodayWellnessPlan();
    dailyWellnessPlan.innerHTML = '';
    plan.tasks.forEach((task) => {
      const row = document.createElement('label');
      row.className = `daily-plan-item${task.completed ? ' completed' : ''}`;

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = task.completed;
      input.addEventListener('change', () => {
        task.completed = input.checked;
        saveJSON(STORAGE_KEYS.WELLNESS_PLAN, plan);
        row.classList.toggle('completed', task.completed);
      });

      const text = document.createElement('span');
      text.textContent = task.label;

      row.appendChild(input);
      row.appendChild(text);
      dailyWellnessPlan.appendChild(row);
    });
  }

  function renderDashboardHeatmap() {
    if (!dashboardHeatmap) return;
    const moods = loadMoods();
    const latestByDay = new Map();
    moods.forEach((entry) => {
      if (!entry.dateKey) return;
      const existing = latestByDay.get(entry.dateKey);
      if (!existing || new Date(entry.timestamp || 0) >= new Date(existing.timestamp || 0)) {
        latestByDay.set(entry.dateKey, entry);
      }
    });

    dashboardHeatmap.innerHTML = '';
    const today = new Date();
    for (let i = 20; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getTodayKey(d);
      const entry = latestByDay.get(key);
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const inner = document.createElement('div');
      inner.className = 'heatmap-cell-inner';
      if (!entry) {
        cell.classList.add('empty');
      } else {
        const mood = Number(entry.mood) || 0;
        if (mood <= 3) inner.style.background = '#ef4444';
        else if (mood <= 7) inner.style.background = '#facc15';
        else inner.style.background = '#22c55e';
      }
      cell.title = entry ? `${d.toLocaleDateString()} ${getMoodDescriptor(entry.mood).emoji}` : `${d.toLocaleDateString()} no entry`;
      cell.appendChild(inner);
      dashboardHeatmap.appendChild(cell);
    }
  }

  function getMoodSuggestion(mood, energy, stress) {
    if (mood <= 3 || stress === 'High') {
      return 'Today might feel heavy. Try a 2-minute breathing exercise and reach out to someone you trust.';
    }
    if (energy === 'Low') {
      return 'Low energy day: keep goals small. One gentle task is enough.';
    }
    if (mood >= 8 && stress === 'Low') {
      return 'You seem to have momentum today. Consider writing one thing that helped.';
    }
    return 'You checked in, and that matters. Keep noticing patterns without judging yourself.';
  }

  function renderMoodInsight(entry) {
    if (!moodInsight || !entry) return;
    moodInsight.textContent = getMoodSuggestion(entry.mood, entry.energy, entry.stress);
  }

  function showMoodDayDetails(date, entry) {
    if (!moodDayDetails) return;
    if (!entry) {
      moodDayDetails.textContent = `No entry for ${date.toLocaleDateString()}.`;
      return;
    }
    const emoji = getMoodEmoji(entry.mood);
    moodDayDetails.innerHTML = `${emoji} <strong>${date.toLocaleDateString()}</strong> &middot; Mood: <strong>${entry.mood}/10</strong>, Energy: <strong>${entry.energy}</strong>, Stress: <strong>${entry.stress}</strong>`;
  }

  function renderMoodHeatmap() {
    if (!moodHeatmap) return;
    const moods = loadMoods();
    const latestByDay = new Map();
    moods.forEach((entry) => {
      if (!entry.dateKey) return;
      const existing = latestByDay.get(entry.dateKey);
      if (!existing) {
        latestByDay.set(entry.dateKey, entry);
        return;
      }
      const existingTime = new Date(existing.timestamp || existing.updatedAt || 0).getTime();
      const currentTime = new Date(entry.timestamp || entry.updatedAt || 0).getTime();
      if (currentTime >= existingTime) {
        latestByDay.set(entry.dateKey, entry);
      }
    });
    const today = new Date();
    const days = [];

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getTodayKey(d);
      const entry = latestByDay.get(key) || null;
      days.push({ date: d, entry });
    }

    moodHeatmap.innerHTML = '';

    days.forEach(({ date, entry }) => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      const inner = document.createElement('div');
      inner.className = 'heatmap-cell-inner';

      if (!entry) {
        cell.classList.add('empty');
      } else {
        const mood = Number(entry.mood) || 0;
        let color;
        if (mood <= 3) color = '#f36c6c';
        else if (mood <= 7) color = '#f7d35c';
        else color = '#7ed321';
        inner.style.background = color;

        cell.dataset.hasEntry = 'true';
        cell.dataset.date = date.toISOString();
        cell.dataset.mood = String(entry.mood);
        cell.dataset.energy = entry.energy;
        cell.dataset.stress = entry.stress;
        inner.textContent = getMoodEmoji(entry.mood);
      }

      const title = entry
        ? `${date.toLocaleDateString()} - Mood: ${entry.mood}/10 ${getMoodEmoji(entry.mood)}`
        : `${date.toLocaleDateString()} - No entry`;
      cell.title = title;

      cell.addEventListener('click', () => {
        showMoodDayDetails(date, entry || null);
      });

      moodHeatmap.appendChild(cell);
    });
  }

  function renderMoodTrendChart() {
    if (!moodTrendCanvas) return;
    if (typeof window.Chart === 'undefined') {
      return;
    }
    if (currentViewId !== 'mood') return;
    const ctx = moodTrendCanvas.getContext('2d');
    if (!ctx) return;
    const moods = loadMoods();
    const latestByDay = new Map();
    moods.forEach((entry) => {
      if (!entry.dateKey) return;
      const existing = latestByDay.get(entry.dateKey);
      if (!existing) {
        latestByDay.set(entry.dateKey, entry);
        return;
      }
      const existingTime = new Date(existing.timestamp || existing.updatedAt || 0).getTime();
      const currentTime = new Date(entry.timestamp || entry.updatedAt || 0).getTime();
      if (currentTime >= existingTime) {
        latestByDay.set(entry.dateKey, entry);
      }
    });
    const today = new Date();
    const labels = [];
    const data = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = getTodayKey(d);
      const entry = latestByDay.get(key) || null;
      labels.push(d.toLocaleDateString([], { month: 'short', day: 'numeric' }));
      data.push(entry ? entry.mood : null);
    }

    if (moodTrendChart) {
      moodTrendChart.destroy();
    }

    moodTrendChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Mood',
            data,
            borderColor: '#4a90e2',
            backgroundColor: 'rgba(74, 144, 226, 0.2)',
            tension: 0.3,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            suggestedMin: 1,
            suggestedMax: 10,
            ticks: { stepSize: 1 },
          },
        },
      },
    });
  }

  if (moodForm) {
    moodForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const mood = Number(moodSlider.value);
      const energy = energySelect.value;
      const stress = stressSelect.value;
      const now = new Date();
      const entry = {
        mood,
        energy,
        stress,
        note: moodNoteInput ? moodNoteInput.value.trim() : '',
        timestamp: now.toISOString(),
        dateKey: getTodayKey(now),
      };
      saveMoodEntry(entry);
      renderTodayMoodStatus();
      renderMoodHeatmap();
      renderDashboardHeatmap();
      renderMoodTrendChart();
      renderProgressSnapshot();
      renderMoodInsight(entry);
      if (moodNoteInput) moodNoteInput.value = '';
    });
  }

  renderTodayMoodStatus();
  renderMoodHeatmap();
  renderDashboardHeatmap();
  renderMoodTrendChart();
  renderProgressSnapshot();
  renderDailyWellnessPlan();

  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', () => {
      const payload = {
        exportedAt: new Date().toISOString(),
        moods: loadMoods(),
        journalEntries: loadJSON(STORAGE_KEYS.JOURNAL_ENTRIES, []),
        comfortMessages: loadComfortMessages(),
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `campuscare-export-${getTodayKey(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  // ==== Crisis Detection ====
  const CRISIS_KEYWORDS = [
    'hurt myself',
    'suicide',
    "can't go on",
    'cant go on',
    'end it all',
    'want to die',
    'no point',
    'better off dead',
    'self harm',
    'self-harm',
    'kill myself',
    'overdose',
    'life is meaningless',
  ];

  const journalInput = document.getElementById('journalInput');
  const analyzeJournalBtn = document.getElementById('analyzeJournalBtn');
  const journalFeedback = document.getElementById('journalFeedback');
  const journalProgress = document.getElementById('journalProgress');
  const journalSpinner = document.getElementById('journalSpinner');
  const journalHistory = document.getElementById('journalHistory');

  function loadJournalEntries() {
    return getAllEntriesByType(ENTRY_TYPES.JOURNAL);
  }

  function saveJournalEntries(entries) {
    const normalized = entries.map((entry) => normalizeLocalEntry(ENTRY_TYPES.JOURNAL, entry));
    saveJSON(STORAGE_KEYS.JOURNAL_ENTRIES, normalized);
  }

  function renderJournalHistory() {
    if (!journalHistory) return;
    const entries = loadJournalEntries()
      .slice()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 5);

    if (!entries.length) {
      journalHistory.innerHTML = '<p class="feedback-text">No journal check-ins yet.</p>';
      return;
    }

    journalHistory.innerHTML = '';
    entries.forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'journal-history-item';

      const meta = document.createElement('p');
      meta.className = 'journal-history-meta';
      meta.textContent = `${new Date(entry.timestamp).toLocaleString()} · ${entry.level}`;

      const text = document.createElement('p');
      text.className = 'journal-history-text';
      text.textContent = entry.text;

      item.appendChild(meta);
      item.appendChild(text);
      journalHistory.appendChild(item);
    });
  }

  function checkForCrisis(text) {
    const lower = text.toLowerCase();
    return CRISIS_KEYWORDS.some((kw) => lower.includes(kw));
  }

  function openEmergencyModal() {
    const modal = document.getElementById('emergencyModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeEmergencyModal() {
    const modal = document.getElementById('emergencyModal');
    if (modal) modal.classList.add('hidden');
  }

  if (analyzeJournalBtn && journalInput) {
    analyzeJournalBtn.addEventListener('click', () => {
      const text = journalInput.value.trim();
      if (!text) {
        journalFeedback.textContent = 'Try writing a sentence or two about how you feel.';
        return;
      }

      journalFeedback.textContent = 'Analyzing your entry...';
      journalFeedback.classList.remove('journal-safe');
      journalInput.classList.remove('crisis-detected');

      if (journalProgress) {
        journalProgress.classList.remove('hidden');
        const barInner = journalProgress.querySelector('.analysis-progress-bar-inner');
        if (barInner) {
          barInner.classList.remove('animate');
          // force reflow to restart animation
          // eslint-disable-next-line no-unused-expressions
          barInner.offsetWidth;
          barInner.classList.add('animate');
        }
      }

      if (journalSpinner) journalSpinner.classList.remove('hidden');
      analyzeJournalBtn.disabled = true;

      setTimeout(() => {
        const crisis = checkForCrisis(text);
        const entries = loadJournalEntries();
        let latestEntry;
        if (crisis) {
          journalFeedback.textContent =
            "We noticed some phrases that suggest you might be going through a really hard time. You're not alone, and support is available.";
          journalInput.classList.add('crisis-detected');
          journalFeedback.classList.remove('journal-safe');
          latestEntry = {
            id: createLocalId(),
            text,
            level: 'High support recommended',
            timestamp: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          entries.push(latestEntry);
          openEmergencyModal();
        } else {
          journalFeedback.textContent =
            '✓ Entry reviewed. Thank you for sharing. Your feelings matter. If you ever feel overwhelmed, please reach out to someone you trust.';
          journalInput.classList.remove('crisis-detected');
          journalFeedback.classList.add('journal-safe');
          latestEntry = {
            id: createLocalId(),
            text,
            level: 'Supportive check-in',
            timestamp: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          entries.push(latestEntry);
        }

        saveJournalEntries(entries);
        if (latestEntry) {
          upsertEntryToCloud(ENTRY_TYPES.JOURNAL, latestEntry).catch((error) => {
            console.error('Failed to sync journal entry', error);
          });
        }
        renderJournalHistory();

        if (journalProgress) journalProgress.classList.add('hidden');
        if (journalSpinner) journalSpinner.classList.add('hidden');
        analyzeJournalBtn.disabled = false;
      }, 2000);
    });
  }

  const emergencyButton = document.getElementById('emergencyButton');
  const closeEmergencyModalBtn = document.getElementById('closeEmergencyModal');
  const connectPeerBtn = document.getElementById('connectPeerBtn');

  if (emergencyButton) {
    emergencyButton.addEventListener('click', openEmergencyModal);
  }

  if (closeEmergencyModalBtn) {
    closeEmergencyModalBtn.addEventListener('click', closeEmergencyModal);
  }

  if (connectPeerBtn) {
    connectPeerBtn.addEventListener('click', () => {
      closeEmergencyModal();
      showView('peer');
    });
  }

  // ==== Comfort Messages (Voice Message Feature) ====
  const comfortForm = document.getElementById('comfortForm');
  const comfortFileInput = document.getElementById('comfortFile');
  const comfortSenderInput = document.getElementById('comfortSender');
  const comfortMessagesList = document.getElementById('comfortMessagesList');
  const comfortPlayer = document.getElementById('comfortPlayer');
  const playComfortBtn = document.getElementById('playComfortBtn');

  function loadComfortMessages() {
    return getAllEntriesByType(ENTRY_TYPES.COMFORT);
  }

  function saveComfortMessages(messages) {
    const normalized = messages.map((entry) => normalizeLocalEntry(ENTRY_TYPES.COMFORT, entry));
    saveJSON(STORAGE_KEYS.COMFORT_MESSAGES, normalized);
  }

  function renderComfortMessages() {
    if (!comfortMessagesList) return;
    const messages = loadComfortMessages();
    comfortMessagesList.innerHTML = '';
    if (!messages.length) {
      comfortMessagesList.innerHTML =
        '<p class="feedback-text">No comfort messages yet. You can upload one to encourage yourself or others.</p>';
      return;
    }

    messages.forEach((msg, index) => {
      const item = document.createElement('div');
      item.className = 'comfort-item';
      const meta = document.createElement('div');
      meta.className = 'comfort-meta';
      meta.textContent = msg.sender ? `From ${msg.sender}` : 'From a caring student';

      const btn = document.createElement('button');
      btn.className = 'secondary-btn';
      btn.textContent = 'Play';
      btn.addEventListener('click', () => {
        if (!comfortPlayer) return;
        comfortPlayer.classList.remove('hidden');
        comfortPlayer.src = msg.dataUrl;
        comfortPlayer.play().catch(() => {});
      });

      item.appendChild(meta);
      item.appendChild(btn);
      comfortMessagesList.appendChild(item);
    });
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  if (comfortForm && comfortFileInput) {
    comfortForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = comfortFileInput.files[0];
      if (!file) return;
      const sender = comfortSenderInput.value.trim();
      try {
        const dataUrl = await fileToDataUrl(file);
        const messages = loadComfortMessages();
        const next = {
          id: createLocalId(),
          sender,
          dataUrl,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        messages.push(next);
        saveComfortMessages(messages);
        upsertEntryToCloud(ENTRY_TYPES.COMFORT, next).catch((error) => {
          console.error('Failed to sync comfort message', error);
        });
        comfortFileInput.value = '';
        renderComfortMessages();
      } catch (err) {
        console.error('Failed to read comfort file', err);
      }
    });
  }

  if (playComfortBtn) {
    playComfortBtn.addEventListener('click', () => {
      const messages = loadComfortMessages();
      if (!messages.length || !comfortPlayer) return;
      const latest = messages[messages.length - 1];
      comfortPlayer.classList.remove('hidden');
      comfortPlayer.src = latest.dataUrl;
      comfortPlayer.play().catch(() => {});
    });
  }

  renderComfortMessages();
  renderJournalHistory();
  initializeCloudAuth().catch((error) => {
    console.error('Cloud auth init failed', error);
    setSyncStatus('Cloud auth setup failed.', true);
  });

  // ==== Anonymous Peer Support (simple local queue) ====
  const needSupportBtn = document.getElementById('needSupportBtn');
  const canHelpBtn = document.getElementById('canHelpBtn');
  const peerStatus = document.getElementById('peerStatus');
  const peerLanding = document.getElementById('peerLanding');
  const chatContainer = document.getElementById('chatContainer');
  const chatRoleLabel = document.getElementById('chatRoleLabel');
  const chatMessagesEl = document.getElementById('chatMessages');
  const chatForm = document.getElementById('chatForm');
  const chatInput = document.getElementById('chatInput');
  const endChatBtn = document.getElementById('endChatBtn');

  let currentPeerRole = null; // 'supporter' or 'seeker'

  function loadPeerQueue() {
    return loadJSON(STORAGE_KEYS.PEER_QUEUE, []);
  }

  function savePeerQueue(queue) {
    saveJSON(STORAGE_KEYS.PEER_QUEUE, queue);
  }

  function loadPeerChat() {
    return loadJSON(STORAGE_KEYS.PEER_CHAT, []);
  }

  function savePeerChat(messages) {
    saveJSON(STORAGE_KEYS.PEER_CHAT, messages);
  }

  function appendChatMessage(role, text) {
    const messages = loadPeerChat();
    const msg = { role, text, timestamp: new Date().toISOString() };
    messages.push(msg);
    savePeerChat(messages);
    renderChatMessages();
  }

  function renderChatMessages() {
    if (!chatMessagesEl) return;
    const messages = loadPeerChat();
    chatMessagesEl.innerHTML = '';
    messages.forEach((msg) => {
      const div = document.createElement('div');
      const prefix = msg.role === 'A' ? 'You' : 'Them';
      div.className = 'chat-message ' + (msg.role === (currentPeerRole === 'seeker' ? 'A' : 'B') ? 'me' : '');
      const span = document.createElement('span');
      span.textContent = `${prefix}: ${msg.text}`;
      div.appendChild(span);
      chatMessagesEl.appendChild(div);
    });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  function startChat(role) {
    currentPeerRole = role;
    if (peerLanding) peerLanding.classList.add('hidden');
    if (chatContainer) chatContainer.classList.remove('hidden');
    if (chatRoleLabel) {
      chatRoleLabel.textContent =
        role === 'seeker' ? 'You are connected as: I need support' : 'You are connected as: I can help';
    }
    renderChatMessages();
  }

  function endChat() {
    currentPeerRole = null;
    savePeerChat([]);
    if (chatContainer) chatContainer.classList.add('hidden');
    if (peerLanding) peerLanding.classList.remove('hidden');
    if (peerStatus) peerStatus.textContent = 'Chat ended. You can start a new one any time.';
  }

  function joinQueue(role) {
    const queue = loadPeerQueue();
    const existingSeeker = queue.find((item) => item.role === 'seeker');
    const existingHelper = queue.find((item) => item.role === 'supporter');

    if (role === 'seeker') {
      if (existingHelper) {
        const filtered = queue.filter((item) => item !== existingHelper);
        savePeerQueue(filtered);
        savePeerChat([]);
        if (peerStatus) peerStatus.textContent = 'Matched with a supporter. You can start chatting.';
        startChat('seeker');
      } else {
        queue.push({ role: 'seeker', createdAt: Date.now() });
        savePeerQueue(queue);
        if (peerStatus) peerStatus.textContent = 'Waiting for someone who can help… you can keep this tab open.';
      }
    } else {
      if (existingSeeker) {
        const filtered = queue.filter((item) => item !== existingSeeker);
        savePeerQueue(filtered);
        savePeerChat([]);
        if (peerStatus) peerStatus.textContent = 'You matched with someone who needs support.';
        startChat('supporter');
      } else {
        queue.push({ role: 'supporter', createdAt: Date.now() });
        savePeerQueue(queue);
        if (peerStatus) peerStatus.textContent = 'You are in the helper queue. We will connect you when someone joins.';
      }
    }
  }

  if (needSupportBtn) {
    needSupportBtn.addEventListener('click', () => joinQueue('seeker'));
  }

  if (canHelpBtn) {
    canHelpBtn.addEventListener('click', () => joinQueue('supporter'));
  }

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text || !currentPeerRole) return;
      const mySymbol = currentPeerRole === 'seeker' ? 'A' : 'B';
      appendChatMessage(mySymbol, text);
      chatInput.value = '';
    });
  }

  if (endChatBtn) {
    endChatBtn.addEventListener('click', endChat);
  }

  // ==== Breathing Exercise (4-4-4-4 Box Breathing) ====
  const breathingCircle = document.getElementById('breathingCircle');
  const breathingPhaseLabel = document.getElementById('breathingPhase');
  const breathingTimerLabel = document.getElementById('breathingTimer');
  const startBreathingBtn = document.getElementById('startBreathingBtn');
  const stopBreathingBtn = document.getElementById('stopBreathingBtn');
  const breathingFullscreenBtn = document.getElementById('breathingFullscreenBtn');
  const toggleMusicBtn = document.getElementById('toggleMusicBtn');
  const breathingMusic = document.getElementById('breathingMusic');

  const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'];
  const PHASE_DURATION = 4; // seconds

  let breathingInterval = null;
  let phaseIndex = 0;
  let phaseRemaining = PHASE_DURATION;
  let isBreathingFullscreen = false;

  function updateBreathingUI() {
    if (breathingPhaseLabel) breathingPhaseLabel.textContent = PHASES[phaseIndex];
    if (breathingTimerLabel) breathingTimerLabel.textContent = String(phaseRemaining).padStart(2, '0');
    if (breathingCircle) {
      if (PHASES[phaseIndex] === 'Breathe in') {
        breathingCircle.classList.add('expand');
      } else if (PHASES[phaseIndex] === 'Breathe out') {
        breathingCircle.classList.remove('expand');
      }
    }
  }

  function startBreathing() {
    phaseIndex = 0;
    phaseRemaining = PHASE_DURATION;
    updateBreathingUI();

    if (breathingInterval) clearInterval(breathingInterval);
    breathingInterval = setInterval(() => {
      phaseRemaining -= 1;
      if (phaseRemaining <= 0) {
        phaseIndex = (phaseIndex + 1) % PHASES.length;
        phaseRemaining = PHASE_DURATION;
      }
      updateBreathingUI();
    }, 1000);
  }

  function stopBreathing() {
    if (breathingInterval) clearInterval(breathingInterval);
    breathingInterval = null;
    phaseIndex = 0;
    phaseRemaining = PHASE_DURATION;
    if (breathingPhaseLabel) breathingPhaseLabel.textContent = 'Press start to begin';
    if (breathingTimerLabel) breathingTimerLabel.textContent = '00';
    if (breathingCircle) breathingCircle.classList.remove('expand');
  }

  if (startBreathingBtn) {
    startBreathingBtn.addEventListener('click', startBreathing);
  }

  if (stopBreathingBtn) {
    stopBreathingBtn.addEventListener('click', stopBreathing);
  }

  if (breathingFullscreenBtn) {
    breathingFullscreenBtn.addEventListener('click', () => {
      isBreathingFullscreen = !isBreathingFullscreen;
      document.body.classList.toggle('breathing-fullscreen', isBreathingFullscreen);
      breathingFullscreenBtn.textContent = isBreathingFullscreen ? 'Exit full screen' : 'Full screen';
    });
  }

  if (toggleMusicBtn && breathingMusic) {
    toggleMusicBtn.addEventListener('click', () => {
      if (breathingMusic.paused) {
        breathingMusic.play().then(() => {
          toggleMusicBtn.textContent = 'Pause calming music';
        }).catch(() => {});
      } else {
        breathingMusic.pause();
        toggleMusicBtn.textContent = 'Play calming music';
      }
    });
  }

  // ==== Wellness Activities wiring ====
  const startBreathingActivityBtn = document.getElementById('startBreathingActivityBtn');
  const startMeditationBtn = document.getElementById('startMeditationBtn');
  const startGroundingBtn = document.getElementById('startGroundingBtn');
  const activityDetails = document.getElementById('activityDetails');

  function setActivityDetails(kind) {
    if (!activityDetails) return;
    if (kind === 'breathing') {
      activityDetails.textContent = "We've opened the breathing exercise. Follow the circle and timer at your own pace.";
    } else if (kind === 'meditation') {
      activityDetails.textContent = 'Quick meditation: sit comfortably, breathe slowly, and gently bring your attention back whenever it wanders.';
    } else if (kind === 'grounding') {
      activityDetails.textContent = 'Grounding exercise: name 5 things you can see, 4 you can touch, 3 you can hear, 2 you can smell, 1 you can taste.';
    }
  }

  if (startBreathingActivityBtn) {
    startBreathingActivityBtn.addEventListener('click', () => {
      showView('breathing');
      startBreathing();
      setActivityDetails('breathing');
    });
  }

  if (startMeditationBtn) {
    startMeditationBtn.addEventListener('click', () => {
      setActivityDetails('meditation');
    });
  }

  if (startGroundingBtn) {
    startGroundingBtn.addEventListener('click', () => {
      setActivityDetails('grounding');
    });
  }

  // ==== Onboarding Flow ====
  const onboardingModal = document.getElementById('onboardingModal');
  const onboardingNextBtn = document.getElementById('onboardingNextBtn');
  const onboardingSkipBtn = document.getElementById('onboardingSkipBtn');
  const closeOnboardingModalBtn = document.getElementById('closeOnboardingModal');

  let onboardingStep = 1;

  function setOnboardingStep(step) {
    if (!onboardingModal) return;
    onboardingStep = step;
    const steps = onboardingModal.querySelectorAll('.onboarding-step');
    const dots = onboardingModal.querySelectorAll('.onboarding-indicator .dot');
    steps.forEach((el) => {
      const s = Number(el.getAttribute('data-step'));
      el.classList.toggle('active', s === step);
    });
    dots.forEach((dot) => {
      const s = Number(dot.getAttribute('data-step-indicator'));
      dot.classList.toggle('active', s === step);
    });
    if (onboardingNextBtn) {
      onboardingNextBtn.textContent = step === 3 ? 'Done' : 'Next';
    }
  }

  function openOnboarding() {
    if (!onboardingModal) return;
    onboardingModal.classList.remove('hidden');
    setOnboardingStep(1);
  }

  function closeOnboarding() {
    if (!onboardingModal) return;
    onboardingModal.classList.add('hidden');
  }

  function completeOnboarding() {
    saveJSON(STORAGE_KEYS.ONBOARDING_DONE, true);
    closeOnboarding();
  }

  if (onboardingNextBtn) {
    onboardingNextBtn.addEventListener('click', () => {
      if (onboardingStep < 3) {
        setOnboardingStep(onboardingStep + 1);
      } else {
        completeOnboarding();
      }
    });
  }

  if (onboardingSkipBtn) {
    onboardingSkipBtn.addEventListener('click', completeOnboarding);
  }

  if (closeOnboardingModalBtn) {
    closeOnboardingModalBtn.addEventListener('click', completeOnboarding);
  }

  const onboardingDone = loadJSON(STORAGE_KEYS.ONBOARDING_DONE, false);
  if (!onboardingDone) {
    openOnboarding();
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeEmergencyModal();
    closeOnboarding();
    closeAuthModalUI();
    if (supportMenu) supportMenu.classList.add('hidden');
  });
})();
