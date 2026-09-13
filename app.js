const portalState = { user: null };

function arrangeTopSections() {
  const main = document.querySelector('main');
  const hero = document.querySelector('.hero');
  const portal = document.getElementById('portal');
  const poll = document.getElementById('poll');
  if (!main || !hero || !portal || !poll) return;
  document.querySelectorAll('section#portal').forEach((element, index) => { if (index > 0) element.remove(); });
  const slideshowForm = document.getElementById('slideshowForm');
  if (slideshowForm) slideshowForm.closest('.admin-upload-panel')?.remove();
  const authPanel = portal.querySelector('.portal-grid');
  if (authPanel) authPanel.remove();
  let updates = document.getElementById('public-updates');
  const stories = document.getElementById('stories');
  if (!updates) {
    updates = document.createElement('section');
    updates.id = 'public-updates';
    updates.className = 'section container';
  }
  if (stories) stories.remove();
  let heroStoryLayer = document.getElementById('hero-story-layer');
  if (!heroStoryLayer) {
    heroStoryLayer = document.createElement('div');
    heroStoryLayer.id = 'hero-story-layer';
    hero.prepend(heroStoryLayer);
  }
  hero.after(updates);
  const topPoll = document.createElement('section');
  topPoll.id = 'top-poll';
  topPoll.className = 'section container';
  topPoll.appendChild(poll);
  updates.after(topPoll);
}

async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'same-origin', headers, ...options });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function showPortalMessage(id, text, type) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = text;
  element.className = `alert show ${type}`;
}

function renderServerUser() {
  const isAdministrator = portalState.user?.role === 'administrator';
  document.querySelectorAll('.admin-only').forEach(element => element.classList.toggle('show', isAdministrator));
  const uploadLock = document.getElementById('uploadLock');
  if (uploadLock) uploadLock.style.display = isAdministrator ? 'none' : 'block';
  const topSignOutButton = document.getElementById('topSignOutButton');
  if (topSignOutButton) topSignOutButton.classList.toggle('show', Boolean(portalState.user));
  const userBar = document.getElementById('userBar');
  if (portalState.user) {
    if (userBar) userBar.classList.add('show');
    const welcomeText = document.getElementById('welcomeText');
    const roleText = document.getElementById('roleText');
    if (welcomeText) welcomeText.textContent = `Welcome, ${portalState.user.name}`;
    if (roleText) roleText.textContent = isAdministrator ? 'Administrator access enabled' : 'Community member';
  } else if (userBar) {
    userBar.classList.remove('show');
  }
}

let storyTimer;

async function loadStories() {
  const response = await apiRequest('/api/stories');
  const container = document.getElementById('hero-story-layer');
  if (!container) return;
  if (storyTimer) clearInterval(storyTimer);
  let currentIndex = 0;
  const render = () => {
    const story = response.stories[currentIndex];
    container.innerHTML = story ? (story.mime_type.startsWith('video/') ? `<video autoplay muted loop playsinline src="${escapeHtml(story.url)}"></video>` : `<img src="${escapeHtml(story.url)}" alt="${escapeHtml(story.caption || 'Community story')}">`) : '';
  };
  render();
  if (response.stories.length > 1) storyTimer = setInterval(() => { currentIndex = (currentIndex + 1) % response.stories.length; render(); }, 10000);
  container.classList.toggle('has-story', response.stories.length > 0);
  renderAdminDeletionControls(null, response.stories);
}

async function loadServerSession() {
  const response = await apiRequest('/api/auth/me');
  portalState.user = response.user;
  renderServerUser();
  await Promise.all([loadContent(), loadPoll(), loadMedia(), loadStories(), loadStatistics()]);
  if (portalState.user?.role === 'administrator') await loadMembers();
}

async function loadContent() {
  const content = await apiRequest('/api/content');
  const pollQuestion = document.querySelector('#poll > .section-heading + p');
  if (pollQuestion) pollQuestion.textContent = content.pollQuestion;
  const information = document.querySelector('#about .section-heading p');
  if (information) information.textContent = content.information;
  const aboutUs = document.getElementById('about-us-copy');
  if (aboutUs) aboutUs.textContent = content.aboutUs;
  const mission = document.getElementById('mission-copy');
  if (mission) mission.textContent = content.mission;
  renderLeaders(content.leaders);
  let updates = document.getElementById('public-updates');
  if (!updates) {
    updates = document.createElement('section');
    updates.id = 'public-updates';
    updates.className = 'section container';
    const media = document.getElementById('media');
    media.parentNode.insertBefore(updates, media);
  }
  updates.hidden = !content.publicUpdates;
  updates.innerHTML = `<div class="section-heading"><h2>Public updates</h2></div><div class="panel"><p>${escapeHtml(content.publicUpdates).replace(/\n/g, '<br>')}</p></div>`;
  if (portalState.user?.role === 'administrator') renderAdminContentEditor(content);
}

function renderLeaders(leaders = []) {
  const container = document.getElementById('leaders-grid');
  if (!container) return;
  const visibleLeaders = leaders.filter(leader => leader.name || leader.position);
  container.innerHTML = visibleLeaders.length ? visibleLeaders.map(leader => `<figure class="panel leader-card"><img src="${escapeHtml(leader.imageUrl || '/IMG_3837.jpg')}" alt="${escapeHtml(leader.name || 'City Boyz leader')}"><figcaption><strong>${escapeHtml(leader.name)}</strong><span>${escapeHtml(leader.position)}</span></figcaption></figure>`).join('') : '<p class="empty-leaders">Leader profiles will appear here soon.</p>';
}

function renderAdminContentEditor(content) {
  const container = document.querySelector('#admin .container');
  if (!container) return;
  let editor = document.getElementById('adminContentEditor');
  if (!editor) {
    editor = document.createElement('div');
    editor.id = 'adminContentEditor';
    editor.className = 'panel';
    editor.innerHTML = '<h2>Manage public content</h2><form id="contentForm"><label for="contentPollQuestion">Poll question (optional)</label><input id="contentPollQuestion" type="text" maxlength="200"><label>Poll options (optional)</label><div class="form-row"><input id="contentOption1" type="text" maxlength="100"><input id="contentOption2" type="text" maxlength="100"></div><div class="form-row"><input id="contentOption3" type="text" maxlength="100"><input id="contentOption4" type="text" maxlength="100"></div><label for="contentInformation">Information</label><textarea id="contentInformation" class="admin-textarea" maxlength="5000"></textarea><label for="contentAboutUs">About Us</label><textarea id="contentAboutUs" class="admin-textarea" maxlength="5000"></textarea><label for="contentMission">Our Mission</label><textarea id="contentMission" class="admin-textarea" maxlength="5000"></textarea><label for="contentUpdates">Public updates</label><textarea id="contentUpdates" class="admin-textarea" maxlength="5000"></textarea><button id="clearUpdatesButton" class="btn btn-outline" type="button">Delete public updates</button><h3>Meet Our Leaders</h3><div id="leaderEditors"></div><button class="btn btn-primary form-button" type="submit">Publish changes</button><div id="contentMessage" class="alert" role="status"></div></form>';
    container.insertBefore(editor, container.firstElementChild.nextElementSibling);
    document.getElementById('contentForm').addEventListener('submit', saveAdminContent);
    document.getElementById('clearUpdatesButton').addEventListener('click', clearPublicUpdates);
  }
  document.getElementById('contentPollQuestion').value = content.pollQuestion;
  [1, 2, 3, 4].forEach((number, index) => { document.getElementById(`contentOption${number}`).value = content.pollOptions[index] || ''; });
  document.getElementById('contentInformation').value = content.information;
  document.getElementById('contentAboutUs').value = content.aboutUs;
  document.getElementById('contentMission').value = content.mission;
  document.getElementById('contentUpdates').value = content.publicUpdates;
  renderLeaderEditors(content.leaders || []);
}

async function clearPublicUpdates() {
  try {
    await apiRequest('/api/admin/content/updates', { method: 'DELETE' });
    await loadContent();
    showPortalMessage('contentMessage', 'Public updates deleted.', 'success');
  } catch (error) { showPortalMessage('contentMessage', error.message, 'error'); }
}

function renderLeaderEditors(leaders) {
  const container = document.getElementById('leaderEditors');
  if (!container) return;
  const entries = [...leaders, {}, {}, {}, {}, {}].slice(0, Math.max(5, leaders.length));
  container.innerHTML = entries.map((leader, index) => `<div class="leader-editor"><div class="leader-editor-grid"><img id="leaderPreview${index}" src="${escapeHtml(leader.imageUrl || '/IMG_3837.jpg')}" alt="Leader preview"><div><label for="leaderName${index}">Leader name</label><input id="leaderName${index}" type="text" maxlength="100" value="${escapeHtml(leader.name || '')}"></div><div><label for="leaderPosition${index}">Position</label><input id="leaderPosition${index}" type="text" maxlength="150" value="${escapeHtml(leader.position || '')}"></div></div><label class="admin-leader-image" for="leaderImage${index}">Leader image<input id="leaderImage${index}" type="file" accept="image/*" data-leader-index="${index}"></label></div>`).join('');
  container.querySelectorAll('input[type="file"]').forEach(input => input.addEventListener('change', previewLeaderImage));
}

function previewLeaderImage(event) {
  const input = event.target;
  const file = input.files[0];
  if (file) document.getElementById(`leaderPreview${input.dataset.leaderIndex}`).src = URL.createObjectURL(file);
}

async function saveAdminContent(event) {
  event.preventDefault();
  const options = [1, 2, 3, 4].map(number => document.getElementById(`contentOption${number}`).value.trim()).filter(Boolean);
  try {
    const leaders = [...document.querySelectorAll('.leader-editor')].map((editor, index) => ({ name: document.getElementById(`leaderName${index}`).value, position: document.getElementById(`leaderPosition${index}`).value, imageUrl: document.getElementById(`leaderPreview${index}`).src })).filter(leader => leader.name || leader.position);
    const content = await apiRequest('/api/admin/content', { method: 'PUT', body: JSON.stringify({ pollQuestion: document.getElementById('contentPollQuestion').value, pollOptions: options, information: document.getElementById('contentInformation').value, aboutUs: document.getElementById('contentAboutUs').value, mission: document.getElementById('contentMission').value, publicUpdates: document.getElementById('contentUpdates').value, leaders }) });
    for (const [index, editor] of [...document.querySelectorAll('.leader-editor')].entries()) {
      const file = editor.querySelector('input[type="file"]').files[0];
      if (file && index < content.leaders.length) {
        const formData = new FormData();
        formData.append('image', file);
        await apiRequest(`/api/admin/leaders/${index}/image`, { method: 'POST', body: formData });
      }
    }
    await Promise.all([loadContent(), loadPoll()]);
    showPortalMessage('contentMessage', 'Public content, mission, and leader profiles updated. Previous votes were reset.', 'success');
  } catch (error) { showPortalMessage('contentMessage', error.message, 'error'); }
}

async function loadPoll() {
  const response = await apiRequest('/api/poll');
  if (!response.options.length) {
    const poll = document.getElementById('poll');
    if (poll) poll.innerHTML = '<div class="section-heading"><h2>Community poll</h2></div><p class="form-note">There is no active poll right now.</p>';
    return;
  }
  document.getElementById('voteCount').textContent = Object.values(response.votes).reduce((sum, count) => sum + count, 0) + ' votes';
  document.getElementById('pollOptions').innerHTML = response.options.map((option, index) => `<label class="poll-option"><input type="radio" name="poll" value="${index}" required ${response.hasVoted ? 'disabled' : ''}> ${escapeHtml(option)}</label>`).join('');
  const total = Object.values(response.votes).reduce((sum, count) => sum + count, 0);
  document.getElementById('pollResults').innerHTML = total ? `<h3>Current results</h3>${response.options.map((option, index) => { const count = response.votes[index] || 0; const percent = Math.round(count / total * 100); return `<div class="result-row"><div class="result-label"><span>${escapeHtml(option)}</span><strong>${percent}%</strong></div><div class="bar"><span style="width:${percent}%"></span></div></div>`; }).join('')}` : '';
  document.querySelector('#pollForm button[type="submit"]').disabled = response.hasVoted;
}



async function loadMedia() {
  const response = await apiRequest('/api/media');
  document.getElementById('mediaList').innerHTML = response.media.length ? response.media.map(item => `<figure class="media-item">${item.mime_type.startsWith('video/') ? `<video controls src="${item.url}"></video>` : `<img src="${item.url}" alt="${escapeHtml(item.caption)}">`}<figcaption>${escapeHtml(item.caption)}</figcaption></figure>`).join('') : '<p class="form-note">No community media has been uploaded yet.</p>';
  renderAdminDeletionControls(response.media, null, null);
}

function renderAdminDeletionControls(media, stories) {
  if (portalState.user?.role !== 'administrator') return;
  const container = document.querySelector('#admin .container');
  if (!container) return;
  let panel = document.getElementById('adminDeletionControls');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'adminDeletionControls';
    panel.className = 'panel';
    panel.innerHTML = '<h2>Delete published content</h2><div id="deleteMediaList"></div><div id="deleteStoriesList"></div>';
    container.appendChild(panel);
    panel.addEventListener('click', deletePublishedContent);
  }
  if (media) document.getElementById('deleteMediaList').innerHTML = `<h3>Community media</h3>${media.length ? media.map(item => `<div class="member-row"><span>${escapeHtml(item.caption)}</span><button class="btn btn-outline" data-delete-type="media" data-delete-id="${item.id}" type="button">Delete</button></div>`).join('') : '<p class="form-note">No community media.</p>'}`;
  if (stories) document.getElementById('deleteStoriesList').innerHTML = `<h3>72-hour stories</h3>${stories.length ? stories.map(item => `<div class="member-row"><span>${escapeHtml(item.caption || item.original_name)}</span><button class="btn btn-outline" data-delete-type="stories" data-delete-id="${item.id}" type="button">Delete</button></div>`).join('') : '<p class="form-note">No active stories.</p>'}`;
}

async function deletePublishedContent(event) {
  const button = event.target.closest('[data-delete-type]');
  if (!button || !window.confirm('Delete this published item?')) return;
  try {
    await apiRequest(`/api/admin/${button.dataset.deleteType}/${button.dataset.deleteId}`, { method: 'DELETE' });
    await Promise.all([loadMedia(), loadStories()]);
  } catch (error) { window.alert(error.message); }
}

async function loadMembers() {
  const response = await apiRequest('/api/admin/users');
  const memberList = document.getElementById('memberList');
  memberList.innerHTML = response.users.map(user => `<div class="member-row"><span><strong>${escapeHtml(user.name)}</strong><br><span class="form-note">${escapeHtml(user.email)}</span></span><span class="role">${escapeHtml(user.role)}</span></div>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function addPasswordToggle(inputId, fieldName) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.name = fieldName;
  const wrapper = document.createElement('div');
  wrapper.className = 'password-field';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.textContent = 'Show';
  toggle.setAttribute('aria-label', 'Show password');
  toggle.addEventListener('click', () => {
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    toggle.textContent = isVisible ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
  });
  wrapper.appendChild(toggle);
}

document.getElementById('mediaFile').name = 'media';
document.getElementById('mediaCaption').name = 'caption';
document.getElementById('signOutButton').addEventListener('click', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  await apiRequest('/api/auth/logout', { method: 'POST' });
  window.location.href = 'auth.html';
}, true);

const topSignOutButton = document.getElementById('topSignOutButton');
if (topSignOutButton) topSignOutButton.addEventListener('click', async event => {
  event.preventDefault();
  await apiRequest('/api/auth/logout', { method: 'POST' });
  window.location.href = 'auth.html';
});

document.getElementById('pollForm').addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const optionIndex = new FormData(event.target).get('poll');
  try {
    await apiRequest('/api/poll', { method: 'POST', body: JSON.stringify({ optionIndex }) });
    await loadPoll();
    showPortalMessage('pollMessage', 'Your vote has been recorded.', 'success');
  } catch (error) { showPortalMessage('pollMessage', error.message, 'error'); }
}, true);

document.getElementById('uploadForm').addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const formData = new FormData(event.target);
  try {
    await apiRequest('/api/media', { method: 'POST', body: formData });
    event.target.reset();
    await loadMedia();
    showPortalMessage('mediaMessage', 'Media uploaded securely.', 'success');
  } catch (error) { showPortalMessage('mediaMessage', error.message, 'error'); }
}, true);

document.getElementById('storyForm').addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const formData = new FormData();
  formData.append('story', document.getElementById('storyFile').files[0]);
  formData.append('caption', document.getElementById('storyCaption').value);
  try {
    await apiRequest('/api/admin/stories', { method: 'POST', body: formData });
    event.target.reset();
    await loadStories();
    showPortalMessage('storyMessage', '72-hour story published.', 'success');
  } catch (error) { showPortalMessage('storyMessage', error.message, 'error'); }
}, true);

const liberiaCountyPositions = {
  Bomi: { x: 93.9, y: 224.1 },
  Bong: { x: 223.1, y: 175.5 },
  Gbarpolu: { x: 125.7, y: 131.3 },
  'Grand Bassa': { x: 185.0, y: 282.9 },
  'Grand Cape Mount': { x: 57.0, y: 172.0 },
  'Grand Gedeh': { x: 383.9, y: 283.3 },
  'Grand Kru': { x: 360.2, y: 425.2 },
  Lofa: { x: 190.2, y: 68.3 },
  Margibi: { x: 138.1, y: 251.8 },
  Maryland: { x: 414.8, y: 430.4 },
  Montserrado: { x: 106.0, y: 246.9 },
  Nimba: { x: 319.4, y: 191.0 },
  'River Gee': { x: 420.9, y: 365.4 },
  'River Cess': { x: 234.9, y: 321.4 },
  Sinoe: { x: 280.5, y: 370.9 }
};

function renderStatisticsMap(stats = []) {
  const total = stats.reduce((sum, item) => sum + Number(item.peopleHelped || 0), 0);
  const totalEl = document.getElementById('statsTotalPeople');
  if (totalEl) totalEl.textContent = total.toLocaleString();
  const listEl = document.getElementById('statsCountyList');
  if (listEl && stats.length) {
    listEl.innerHTML = stats.map(county => {
      const percent = total > 0 ? Math.round((county.peopleHelped / total) * 100) : 0;
      return `<div class="county-stat"><span class="county-name">${escapeHtml(county.name)}</span><div class="stat-value"><div class="people-count">${Number(county.peopleHelped || 0).toLocaleString()}</div><div class="stat-percent">${percent}% of total</div></div></div>`;
    }).join('');
  } else if (listEl) {
    listEl.innerHTML = '<p class="form-note">No statistics available yet.</p>';
  }
  const markers = document.getElementById('countyMarkers');
  if (!markers) return;
  markers.innerHTML = stats.map(county => {
    const point = liberiaCountyPositions[county.name] || { x: 250, y: 240 };
    const labelVal = Number(county.peopleHelped || 0).toLocaleString();
    return `<g transform="translate(${point.x}, ${point.y})" style="cursor:pointer;">
      <circle r="10" fill="#d97706" opacity="0.25"/>
      <circle r="5" fill="#d97706" stroke="#0b3861" stroke-width="1.5"/>
      <rect x="-16" y="7" width="32" height="13" rx="3" fill="#ffffff" stroke="#0b3861" stroke-width="0.8" opacity="0.92"/>
      <text x="0" y="16" font-size="9" font-family="Arial, sans-serif" font-weight="bold" fill="#0b3861" text-anchor="middle">${labelVal}</text>
    </g>`;
  }).join('');
}

async function loadStatistics() {
  try {
    const response = await apiRequest('/api/statistics');
    renderStatisticsMap(response.stats || []);
    if (portalState.user?.role === 'administrator') renderStatisticsEditor(response.stats || []);
  } catch (error) {
    console.warn('Statistics load failed:', error);
  }
}

function renderStatisticsEditor(stats = []) {
  const container = document.getElementById('statsEditor');
  if (!container) return;
  const rows = stats.length ? stats : [{ id: null, name: '', peopleHelped: 0 }];
  container.innerHTML = rows.map((county, idx) => `
    <div class="stats-entry-row" data-index="${idx}">
      <div><label>County</label><input type="text" data-field="name" value="${escapeHtml(county.name || '')}" placeholder="e.g., Montserrado" /></div>
      <div><label>People Helped</label><input type="number" data-field="peopleHelped" min="0" value="${Number(county.peopleHelped || 0)}" /></div>
      <button type="button" class="btn-remove-county" data-index="${idx}">Remove</button>
    </div>
  `).join('');
  const addBtn = document.getElementById('addStatsRow');
  if (addBtn) addBtn.onclick = () => {
    const current = [...document.querySelectorAll('.stats-entry-row')].map(row => ({
      id: row.dataset.id || null,
      name: row.querySelector('[data-field="name"]').value.trim(),
      peopleHelped: Number(row.querySelector('[data-field="peopleHelped"]').value || 0)
    }));
    current.push({ id: null, name: '', peopleHelped: 0 });
    renderStatisticsEditor(current);
  };
  container.onclick = event => {
    const removeBtn = event.target.closest('.btn-remove-county');
    if (!removeBtn) return;
    const entries = [...document.querySelectorAll('.stats-entry-row')];
    const idx = Number(removeBtn.dataset.index);
    const next = entries.filter((_, i) => i !== idx).map(row => ({
      id: row.dataset.id || null,
      name: row.querySelector('[data-field="name"]').value.trim(),
      peopleHelped: Number(row.querySelector('[data-field="peopleHelped"]').value || 0)
    }));
    renderStatisticsEditor(next.length ? next : [{ id: null, name: '', peopleHelped: 0 }]);
  };
  const saveBtn = document.getElementById('saveStatsButton');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const entries = [...document.querySelectorAll('.stats-entry-row')].map(row => ({
        name: row.querySelector('[data-field="name"]').value.trim(),
        peopleHelped: Number(row.querySelector('[data-field="peopleHelped"]').value || 0)
      })).filter(e => e.name && e.peopleHelped >= 0);
      if (!entries.length) {
        showPortalMessage('statsMessage', 'Add at least one county with a name.', 'error');
        return;
      }
      try {
        const response = await apiRequest('/api/admin/statistics', { method: 'PUT', body: JSON.stringify({ entries }) });
        renderStatisticsMap(response.stats || []);
        showPortalMessage('statsMessage', 'Statistics saved successfully.', 'success');
      } catch (error) {
        showPortalMessage('statsMessage', error.message, 'error');
      }
    };
  }
}

arrangeTopSections();
loadServerSession().catch(() => { renderServerUser(); loadContent().catch(() => {}); loadPoll().catch(() => {}); loadMedia().catch(() => {}); loadStories().catch(() => {}); loadStatistics().catch(() => {}); });
