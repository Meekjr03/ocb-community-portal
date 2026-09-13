async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { credentials: 'same-origin', headers, ...options });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function showMessage(text, type) {
  const message = document.getElementById('authMessage');
  message.textContent = text;
  message.className = `alert show ${type}`;
}

function addPasswordToggle(inputId) {
  const input = document.getElementById(inputId);
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
    const visible = input.type === 'text';
    input.type = visible ? 'password' : 'text';
    toggle.textContent = visible ? 'Show' : 'Hide';
    toggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
  });
  wrapper.appendChild(toggle);
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab, .tab-panel').forEach(element => element.classList.remove('active'));
  button.classList.add('active');
  document.getElementById(button.dataset.tab).classList.add('active');
}));

addPasswordToggle('signinPassword');
addPasswordToggle('signupPassword');

document.getElementById('signinForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('signinEmail'), password: form.get('signinPassword') }) });
    window.location.href = 'index.html';
  } catch (error) { showMessage(error.message, 'error'); }
});

document.getElementById('signupForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await apiRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name: form.get('signupName'), email: form.get('signupEmail'), password: form.get('signupPassword') }) });
    await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('signupEmail'), password: form.get('signupPassword') }) });
    window.location.href = 'index.html';
  } catch (error) { showMessage(error.message, 'error'); }
});
