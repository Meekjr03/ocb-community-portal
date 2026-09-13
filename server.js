require('dotenv').config();

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const express = require('express');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const Database = require('better-sqlite3');
const argon2 = require('argon2');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || 'ocb-community-portal-production-session-secret-2026-key';
const adminEmail = (process.env.ADMIN_EMAIL || 'admin@cityboyz.org').trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD || 'CityBoyz2026!AdminAccess';

const dataDirectory = path.join(__dirname, 'data');
const uploadDirectory = path.join(dataDirectory, 'uploads');

fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(uploadDirectory, { recursive: true });
const database = new Database(path.join(dataDirectory, 'ocb.sqlite'));
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'administrator')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS poll_votes (
    user_id INTEGER PRIMARY KEY,
    option_index INTEGER NOT NULL CHECK (option_index BETWEEN 0 AND 3),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    caption TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS slideshow_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    caption TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    caption TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS county_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    county_name TEXT NOT NULL UNIQUE,
    people_helped INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS site_content (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    poll_question TEXT NOT NULL,
    poll_options TEXT NOT NULL,
    information TEXT NOT NULL,
    public_updates TEXT NOT NULL,
    about_us TEXT NOT NULL DEFAULT 'City Boyz was founded in June of 2021.',
    mission TEXT NOT NULL DEFAULT 'Our mission is to connect people, share opportunities, and build a stronger community together.',
    leaders TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

`);
try { database.exec("ALTER TABLE slideshow_items ADD COLUMN mime_type TEXT NOT NULL DEFAULT 'image/jpeg'"); } catch (error) { if (!error.message.includes('duplicate column name')) throw error; }
for (const statement of [
  "ALTER TABLE site_content ADD COLUMN about_us TEXT NOT NULL DEFAULT 'City Boyz was founded in June of 2021.'",
  "ALTER TABLE site_content ADD COLUMN mission TEXT NOT NULL DEFAULT 'Our mission is to connect people, share opportunities, and build a stronger community together.'",
  "ALTER TABLE site_content ADD COLUMN leaders TEXT NOT NULL DEFAULT '[]'"
]) {
  try { database.exec(statement); } catch (error) { if (!error.message.includes('duplicate column name')) throw error; }
}

const findUser = database.prepare('SELECT id, name, email, password_hash, role FROM users WHERE email = ?');
const publicUser = user => ({ id: user.id, name: user.name, email: user.email, role: user.role });
const findVote = database.prepare('SELECT option_index FROM poll_votes WHERE user_id = ?');
const defaultContent = {
  pollQuestion: 'What should OCB prioritize this month?',
  pollOptions: ['Youth programs', 'Community events', 'Skills and jobs', 'Neighborhood clean-up'],
  information: 'OCB brings people together around practical support, local creativity, and a stronger voice for our neighborhood.',
  publicUpdates: 'Welcome to the OCB community portal. Check back here for the latest public announcements.',
  aboutUs: 'City Boyz was founded in June of 2021.',
  mission: 'Our mission is to connect people, share opportunities, and build a stronger community together.',
  leaders: []
};

const contentRow = database.prepare('SELECT poll_question, poll_options, information, public_updates, about_us, mission, leaders, updated_at FROM site_content WHERE id = 1');
const readContent = () => {
  const row = contentRow.get();
  if (!row) {
    database.prepare('INSERT INTO site_content (id, poll_question, poll_options, information, public_updates, about_us, mission, leaders) VALUES (1, ?, ?, ?, ?, ?, ?, ?)').run(defaultContent.pollQuestion, JSON.stringify(defaultContent.pollOptions), defaultContent.information, defaultContent.publicUpdates, defaultContent.aboutUs, defaultContent.mission, JSON.stringify(defaultContent.leaders));
    return defaultContent;
  }
  return { pollQuestion: row.poll_question, pollOptions: JSON.parse(row.poll_options), information: row.information, publicUpdates: row.public_updates, aboutUs: row.about_us, mission: row.mission, leaders: JSON.parse(row.leaders || '[]'), updatedAt: row.updated_at };
};
readContent();
const defaultStatistics = [
  { name: 'Montserrado', peopleHelped: 845 },
  { name: 'Margibi', peopleHelped: 620 },
  { name: 'Bong', peopleHelped: 540 },
  { name: 'Nimba', peopleHelped: 720 },
  { name: 'Lofa', peopleHelped: 470 },
  { name: 'Grand Bassa', peopleHelped: 390 },
  { name: 'Maryland', peopleHelped: 310 },
  { name: 'River Gee', peopleHelped: 240 },
  { name: 'Sinoe', peopleHelped: 270 },
  { name: 'Grand Cape Mount', peopleHelped: 220 },
  { name: 'Bomi', peopleHelped: 190 },
  { name: 'Grand Kru', peopleHelped: 200 },
  { name: 'Gbarpolu', peopleHelped: 180 },
  { name: 'River Cess', peopleHelped: 140 },
  { name: 'Grand Gedeh', peopleHelped: 260 }
];
const statsCount = database.prepare('SELECT COUNT(*) as count FROM county_statistics').get();
if (statsCount.count === 0) {
  const insertStat = database.prepare('INSERT INTO county_statistics (county_name, people_helped) VALUES (?, ?)');
  database.transaction(() => {
    defaultStatistics.forEach(stat => insertStat.run(stat.name, stat.peopleHelped));
  })();
}
const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, /^(image|video)\//.test(file.mimetype))
});
const slideshowUpload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, /^(image|video)\//.test(file.mimetype))
});

function removeExpiredStories() {
  const expired = database.prepare("SELECT filename FROM stories WHERE expires_at <= datetime('now')").all();
  database.prepare("DELETE FROM stories WHERE expires_at <= datetime('now')").run();
  expired.forEach(story => fs.rmSync(path.join(uploadDirectory, story.filename), { force: true }));
}
database.prepare("UPDATE stories SET expires_at = datetime(created_at, '+72 hours') WHERE expires_at > datetime('now')").run();
removeExpiredStories();

async function provisionAdministrator() {
  const email = adminEmail;
  const existing = findUser.get(email);
  if (existing) {
    if (existing.role !== 'administrator') {
      database.prepare("UPDATE users SET role = 'administrator' WHERE id = ?").run(existing.id);
    }
    if (!(await argon2.verify(existing.password_hash, adminPassword))) {
      const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
      database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, existing.id);
    }
    return;
  }
  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  database.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run('Site Administrator', email, passwordHash, 'administrator');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use(session({
  store: new (SQLiteStoreFactory(session))({ db: 'sessions.sqlite', dir: dataDirectory }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const requireAdministrator = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'administrator') return res.status(403).json({ error: 'Administrator access required.' });
  next();
};
const validEmail = email => typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

app.post('/api/auth/signup', authLimiter, async (req, res, next) => {
  try {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 100 || !validEmail(email) || password.length < 12) return res.status(400).json({ error: 'Use a valid name, email, and password of at least 12 characters.' });
    if (findUser.get(email)) return res.status(409).json({ error: 'An account with this email already exists.' });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    database.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)').run(name, email, passwordHash, 'member');
    res.status(201).json({ message: 'Account created.' });
  } catch (error) { next(error); }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const user = findUser.get(email);
    const valid = user && await argon2.verify(user.password_hash, password);
    if (!valid) return res.status(401).json({ error: 'Email or password is incorrect.' });
    req.session.regenerate(sessionError => {
      if (sessionError) return next(sessionError);
      req.session.user = publicUser(user);
      res.json({ user: publicUser(user) });
    });
  } catch (error) { next(error); }
});

app.post('/api/auth/logout', (req, res, next) => req.session.destroy(error => error ? next(error) : res.status(204).end()));
app.get('/api/auth/me', (req, res) => res.json({ user: req.session.user || null }));
app.get('/api/admin/users', requireAdministrator, (req, res) => {
  const users = database.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});
app.get('/api/content', (req, res) => res.json(readContent()));
app.put('/api/admin/content', requireAdministrator, (req, res, next) => {
  try {
    const pollQuestion = typeof req.body.pollQuestion === 'string' ? req.body.pollQuestion.trim() : '';
    const pollOptions = Array.isArray(req.body.pollOptions) ? req.body.pollOptions.map(option => typeof option === 'string' ? option.trim() : '').filter(Boolean) : [];
    const information = typeof req.body.information === 'string' ? req.body.information.trim() : '';
    const publicUpdates = typeof req.body.publicUpdates === 'string' ? req.body.publicUpdates.trim() : '';
    const aboutUs = typeof req.body.aboutUs === 'string' ? req.body.aboutUs.trim() : '';
    const mission = typeof req.body.mission === 'string' ? req.body.mission.trim() : '';
    const leaders = Array.isArray(req.body.leaders) ? req.body.leaders.map(leader => ({ name: typeof leader.name === 'string' ? leader.name.trim() : '', position: typeof leader.position === 'string' ? leader.position.trim() : '', imageUrl: typeof leader.imageUrl === 'string' ? leader.imageUrl.trim() : '' })).filter(leader => leader.name || leader.position || leader.imageUrl) : [];
    const hasPoll = Boolean(pollQuestion || pollOptions.length);
    if ((hasPoll && (pollQuestion.length < 3 || pollQuestion.length > 200 || pollOptions.length < 2 || pollOptions.length > 4 || new Set(pollOptions.map(option => option.toLowerCase())).size !== pollOptions.length || pollOptions.some(option => option.length > 100))) || information.length > 5000 || publicUpdates.length > 5000 || aboutUs.length > 5000 || mission.length > 5000 || leaders.length > 12 || leaders.some(leader => leader.name.length > 100 || leader.position.length > 150 || leader.imageUrl.length > 500)) return res.status(400).json({ error: 'Check the poll, public text, and leader fields. Text must be under 5,000 characters.' });
    const updateContent = database.transaction(() => {
      database.prepare('UPDATE site_content SET poll_question = ?, poll_options = ?, information = ?, public_updates = ?, about_us = ?, mission = ?, leaders = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(pollQuestion, JSON.stringify(pollOptions), information, publicUpdates, aboutUs, mission, JSON.stringify(leaders));
      database.prepare('DELETE FROM poll_votes').run();
    });
    updateContent();
    res.json(readContent());
  } catch (error) { next(error); }
});
app.delete('/api/admin/content/updates', requireAdministrator, (req, res, next) => {
  try {
    database.prepare("UPDATE site_content SET public_updates = '', updated_at = CURRENT_TIMESTAMP WHERE id = 1").run();
    res.json(readContent());
  } catch (error) { next(error); }
});
app.post('/api/admin/leaders/:index/image', requireAdministrator, upload.single('image'), (req, res, next) => {
  try {
    const index = Number(req.params.index);
    const content = readContent();
    if (!Number.isInteger(index) || index < 0 || index >= content.leaders.length || !req.file || !req.file.mimetype.startsWith('image/')) {
      if (req.file) fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: 'Choose a valid leader and an image file.' });
    }
    const leaders = content.leaders.map((leader, leaderIndex) => leaderIndex === index ? { ...leader, imageUrl: `/uploads/${encodeURIComponent(req.file.filename)}` } : leader);
    database.prepare('UPDATE site_content SET leaders = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(JSON.stringify(leaders));
    res.json(readContent());
  } catch (error) { if (req.file) fs.rmSync(req.file.path, { force: true }); next(error); }
});
app.get('/api/poll', (req, res) => {
  const content = readContent();
  if (!content.pollQuestion || !content.pollOptions.length) return res.json({ question: '', options: [], votes: {}, hasVoted: false });
  const counts = database.prepare('SELECT option_index, COUNT(*) AS count FROM poll_votes GROUP BY option_index').all();
  const votes = Object.fromEntries(counts.map(row => [row.option_index, row.count]));
  res.json({ question: content.pollQuestion, options: content.pollOptions, votes, hasVoted: Boolean(req.session.user && findVote.get(req.session.user.id)) });
});
app.post('/api/poll', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in before voting.' });
  const pollOptions = readContent().pollOptions;
  const optionIndex = Number(req.body.optionIndex);
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= pollOptions.length) return res.status(400).json({ error: 'Choose a valid poll option.' });
  if (findVote.get(req.session.user.id)) return res.status(409).json({ error: 'You have already voted in this poll.' });
  database.prepare('INSERT INTO poll_votes (user_id, option_index) VALUES (?, ?)').run(req.session.user.id, optionIndex);
  res.status(201).json({ message: 'Your vote has been recorded.' });
});

app.get('/api/media', (req, res) => {
  const items = database.prepare('SELECT id, filename, original_name, mime_type, caption, created_at FROM media ORDER BY created_at DESC').all();
  res.json({ media: items.map(item => ({ ...item, url: `/uploads/${encodeURIComponent(item.filename)}` })) });
});
app.post('/api/media', requireAdministrator, upload.single('media'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an image or video file under 50 MB.' });
    const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 100) : '';
    database.prepare('INSERT INTO media (filename, original_name, mime_type, caption, uploaded_by) VALUES (?, ?, ?, ?, ?)').run(req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype, caption || req.file.originalname.slice(0, 100), req.session.user.id);
    res.status(201).json({ message: 'Media uploaded.' });
  } catch (error) { if (req.file) fs.rmSync(req.file.path, { force: true }); next(error); }
});
app.delete('/api/admin/media/:id', requireAdministrator, (req, res, next) => {
  try {
    const item = database.prepare('SELECT filename FROM media WHERE id = ?').get(Number(req.params.id));
    if (!item) return res.status(404).json({ error: 'Media item not found.' });
    database.prepare('DELETE FROM media WHERE id = ?').run(Number(req.params.id));
    fs.rmSync(path.join(uploadDirectory, item.filename), { force: true });
    res.status(204).end();
  } catch (error) { next(error); }
});
app.get('/api/slideshow', (req, res) => {
  const items = database.prepare('SELECT id, filename, original_name, mime_type, caption, created_at FROM slideshow_items ORDER BY created_at DESC').all();
  res.json({ items: items.map(item => ({ ...item, url: `/uploads/${encodeURIComponent(item.filename)}` })) });
});
app.post('/api/admin/slideshow', requireAdministrator, slideshowUpload.single('media'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an image or video under 50 MB.' });
    const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 160) : '';
    database.prepare('INSERT INTO slideshow_items (filename, original_name, mime_type, caption, uploaded_by) VALUES (?, ?, ?, ?, ?)').run(req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype, caption, req.session.user.id);
    res.status(201).json({ message: 'Slideshow image added.' });
  } catch (error) { if (req.file) fs.rmSync(req.file.path, { force: true }); next(error); }
});
app.delete('/api/admin/slideshow/:id', requireAdministrator, (req, res, next) => {
  try {
    const item = database.prepare('SELECT filename FROM slideshow_items WHERE id = ?').get(Number(req.params.id));
    if (!item) return res.status(404).json({ error: 'Slideshow image not found.' });
    database.prepare('DELETE FROM slideshow_items WHERE id = ?').run(Number(req.params.id));
    fs.rmSync(path.join(uploadDirectory, item.filename), { force: true });
    res.status(204).end();
  } catch (error) { next(error); }
});
app.get('/api/stories', (req, res) => {
  removeExpiredStories();
  const items = database.prepare('SELECT id, filename, original_name, mime_type, caption, created_at, expires_at FROM stories WHERE expires_at > datetime(\'now\') ORDER BY created_at DESC').all();
  res.json({ stories: items.map(item => ({ ...item, url: `/uploads/${encodeURIComponent(item.filename)}` })) });
});
app.delete('/api/admin/stories/:id', requireAdministrator, (req, res, next) => {
  try {
    const item = database.prepare('SELECT filename FROM stories WHERE id = ?').get(Number(req.params.id));
    if (!item) return res.status(404).json({ error: 'Story not found.' });
    database.prepare('DELETE FROM stories WHERE id = ?').run(Number(req.params.id));
    fs.rmSync(path.join(uploadDirectory, item.filename), { force: true });
    res.status(204).end();
  } catch (error) { next(error); }
});
app.post('/api/admin/stories', requireAdministrator, upload.single('story'), (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose an image or video under 50 MB.' });
    const caption = typeof req.body.caption === 'string' ? req.body.caption.trim().slice(0, 160) : '';
    database.prepare("INSERT INTO stories (filename, original_name, mime_type, caption, uploaded_by, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now', '+72 hours'))").run(req.file.filename, req.file.originalname.slice(0, 255), req.file.mimetype, caption, req.session.user.id);
    res.status(201).json({ message: '72-hour story published.' });
  } catch (error) { if (req.file) fs.rmSync(req.file.path, { force: true }); next(error); }
});
app.get('/api/statistics', (req, res) => {
  const stats = database.prepare('SELECT id, county_name AS name, people_helped AS peopleHelped, updated_at FROM county_statistics ORDER BY people_helped DESC').all();
  res.json({ stats: stats.map(s => ({ ...s, peopleHelped: s.peopleHelped })) });
});
app.put('/api/admin/statistics', requireAdministrator, (req, res, next) => {
  try {
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const sanitized = entries.map(e => ({ name: typeof e.name === 'string' ? e.name.trim() : '', peopleHelped: Number(e.peopleHelped) || 0 })).filter(e => e.name && e.peopleHelped >= 0);
    if (!sanitized.length) return res.status(400).json({ error: 'Add at least one county.' });
    database.transaction(() => {
      database.prepare('DELETE FROM county_statistics').run();
      const insert = database.prepare('INSERT INTO county_statistics (county_name, people_helped) VALUES (?, ?)');
      sanitized.forEach(e => insert.run(e.name, e.peopleHelped));
    })();
    const stats = database.prepare('SELECT id, county_name AS name, people_helped AS peopleHelped, updated_at FROM county_statistics ORDER BY people_helped DESC').all();
    res.json({ stats: stats.map(s => ({ ...s, peopleHelped: s.peopleHelped })) });
  } catch (error) { next(error); }
});

app.use('/uploads', express.static(uploadDirectory, { dotfiles: 'deny', index: false }));
app.use(express.static(__dirname, { extensions: ['html'] }));
app.use((error, req, res, next) => { console.error(error); res.status(500).json({ error: 'Unexpected server error.' }); });

app.listen(port, '0.0.0.0', () => {
  console.log(`OCB portal running at http://0.0.0.0:${port}`);
  provisionAdministrator().catch(error => console.error('Failed to provision administrator:', error));
});
