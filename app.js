const portalState = { user: null };

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
  element.textContent = text;
  element.className = `alert show ${type}`;
}

function renderServerUser() {
  const isAdministrator = portalState.user?.role === 'administrator';
  document.querySelectorAll('.admin-only').forEach(element => element.classList.toggle('show', isAdministrator));
  document.getElementById('uploadLock').style.display = isAdministrator ? 'none' : 'block';
  const userBar = document.getElementById('userBar');
  if (portalState.user) {
    userBar.classList.add('show');
    document.getElementById('welcomeText').textContent = `Welcome, ${portalState.user.name}`;
    document.getElementById('roleText').textContent = isAdministrator ? 'Administrator access enabled' : 'Community member';
  } else {
    userBar.classList.remove('show');
  }
}

async function loadServerSession() {
  const response = await apiRequest('/api/auth/me');
  portalState.user = response.user;
  renderServerUser();
  await Promise.all([loadContent(), loadPoll(), loadMedia()]);
  if (portalState.user?.role === 'administrator') await loadMembers();
}

async function loadContent() {
  const content = await apiRequest('/api/content');
  const pollQuestion = document.querySelector('#poll > .section-heading + p');
  if (pollQuestion) pollQuestion.textContent = content.pollQuestion;
  const information = document.querySelector('#about .section-heading p');
  if (information) information.textContent = content.information;
  let updates = document.getElementById('public-updates');
  if (!updates) {
    updates = document.createElement('section');
    updates.id = 'public-updates';
    updates.className = 'section container';
    const media = document.getElementById('media');
    media.parentNode.insertBefore(updates, media);
  }
  updates.innerHTML = `<div class="section-heading"><h2>Public updates</h2></div><div class="panel"><p>${escapeHtml(content.publicUpdates).replace(/\n/g, '<br>')}</p></div>`;
  if (portalState.user?.role === 'administrator') renderAdminContentEditor(content);
}

function renderAdminContentEditor(content) {
  const container = document.querySelector('#admin .container');
  if (!container) return;
  let editor = document.getElementById('adminContentEditor');
  if (!editor) {
    editor = document.createElement('div');
    editor.id = 'adminContentEditor';
    editor.className = 'panel';
    editor.innerHTML = '<h2>Manage public content</h2><form id="contentForm"><label for="contentPollQuestion">Poll question</label><input id="contentPollQuestion" type="text" maxlength="200" required><label>Poll options</label><div class="form-row"><input id="contentOption1" type="text" maxlength="100" required><input id="contentOption2" type="text" maxlength="100" required></div><div class="form-row"><input id="contentOption3" type="text" maxlength="100"><input id="contentOption4" type="text" maxlength="100"></div><label for="contentInformation">Information</label><textarea id="contentInformation" maxlength="5000"></textarea><label for="contentUpdates">Public updates</label><textarea id="contentUpdates" maxlength="5000"></textarea><button class="btn btn-primary form-button" type="submit">Publish changes</button><div id="contentMessage" class="alert" role="status"></div></form>';
    container.insertBefore(editor, container.firstElementChild.nextElementSibling);
    document.getElementById('contentForm').addEventListener('submit', saveAdminContent);
  }
  document.getElementById('contentPollQuestion').value = content.pollQuestion;
  [1, 2, 3, 4].forEach((number, index) => { document.getElementById(`contentOption${number}`).value = content.pollOptions[index] || ''; });
  document.getElementById('contentInformation').value = content.information;
  document.getElementById('contentUpdates').value = content.publicUpdates;
}

async function saveAdminContent(event) {
  event.preventDefault();
  const options = [1, 2, 3, 4].map(number => document.getElementById(`contentOption${number}`).value.trim()).filter(Boolean);
  try {
    await apiRequest('/api/admin/content', { method: 'PUT', body: JSON.stringify({ pollQuestion: document.getElementById('contentPollQuestion').value, pollOptions: options, information: document.getElementById('contentInformation').value, publicUpdates: document.getElementById('contentUpdates').value }) });
    await Promise.all([loadContent(), loadPoll()]);
    showPortalMessage('contentMessage', 'Public content and poll updated. Previous votes were reset.', 'success');
  } catch (error) { showPortalMessage('contentMessage', error.message, 'error'); }
}

async function loadPoll() {
  const response = await apiRequest('/api/poll');
  document.getElementById('voteCount').textContent = Object.values(response.votes).reduce((sum, count) => sum + count, 0) + ' votes';
  document.getElementById('pollOptions').innerHTML = response.options.map((option, index) => `<label class="poll-option"><input type="radio" name="poll" value="${index}" required ${response.hasVoted ? 'disabled' : ''}> ${escapeHtml(option)}</label>`).join('');
  const total = Object.values(response.votes).reduce((sum, count) => sum + count, 0);
  document.getElementById('pollResults').innerHTML = total ? `<h3>Current results</h3>${response.options.map((option, index) => { const count = response.votes[index] || 0; const percent = Math.round(count / total * 100); return `<div class="result-row"><div class="result-label"><span>${escapeHtml(option)}</span><strong>${percent}%</strong></div><div class="bar"><span style="width:${percent}%"></span></div></div>`; }).join('')}` : '';
  document.querySelector('#pollForm button[type="submit"]').disabled = response.hasVoted;
}

async function loadMedia() {
  const response = await apiRequest('/api/media');
  document.getElementById('mediaList').innerHTML = response.media.length ? response.media.map(item => `<figure class="media-item">${item.mime_type.startsWith('video/') ? `<video controls src="${item.url}"></video>` : `<img src="${item.url}" alt="${escapeHtml(item.caption)}">`}<figcaption>${escapeHtml(item.caption)}</figcaption></figure>`).join('') : '<p class="form-note">No community media has been uploaded yet.</p>';
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

document.getElementById('signinEmail').name = 'signinEmail';
document.getElementById('signupName').name = 'signupName';
document.getElementById('signupEmail').name = 'signupEmail';
document.getElementById('mediaFile').name = 'media';
document.getElementById('mediaCaption').name = 'caption';
addPasswordToggle('signinPassword', 'signinPassword');
addPasswordToggle('signupPassword', 'signupPassword');

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab, .tab-panel').forEach(element => element.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(button.dataset.tab).classList.add('active');
}));

document.getElementById('signupForm').addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = new FormData(event.target);
  try {
    await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: form.get('signupName'), email: form.get('signupEmail'), password: form.get('signupPassword') }) });
    event.target.reset();
    showPortalMessage('authMessage', 'Account created. You can sign in now.', 'success');
    document.querySelector('[data-tab="signin"]').click();
  } catch (error) { showPortalMessage('authMessage', error.message, 'error'); }
}, true);

document.getElementById('signinForm').addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  const form = new FormData(event.target);
  try {
    const response = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('signinEmail'), password: form.get('signinPassword') }) });
    portalState.user = response.user;
    event.target.reset();
    showPortalMessage('authMessage', 'Signed in securely.', 'success');
    renderServerUser();
    if (portalState.user.role === 'administrator') { await loadMembers(); await loadContent(); }
  } catch (error) { showPortalMessage('authMessage', error.message, 'error'); }
}, true);

document.getElementById('signOutButton').addEventListener('click', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  await apiRequest('/api/auth/logout', { method: 'POST' });
  portalState.user = null;
  renderServerUser();
  showPortalMessage('authMessage', 'You have been signed out.', 'success');
}, true);

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

loadServerSession().catch(() => { renderServerUser(); loadContent().catch(() => {}); loadPoll().catch(() => {}); loadMedia().catch(() => {}); });
