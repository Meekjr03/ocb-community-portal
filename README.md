# OCB Community Portal

## Secure backend setup

1. Install Node.js 20 LTS or newer.
2. Open this folder in Terminal.
3. Install dependencies:

   ```sh
   npm install
   ```

4. Create the environment file:

   ```sh
   cp .env.example .env
   ```

5. Edit `.env` and set a unique random `SESSION_SECRET` with at least 32 characters, plus a strong administrator email and password. The administrator password must be at least 12 characters.
6. Start the server:

   ```sh
   npm start
   ```

7. Open `http://localhost:3000`.

The server creates the administrator account on first start using `ADMIN_EMAIL` and `ADMIN_PASSWORD`, then stores only an Argon2id password hash in SQLite. Login uses a server-side SQLite session and an `HttpOnly` cookie. Administrator member data is protected by a server-side role check at `/api/admin/users`.

State-changing API requests require a session-backed CSRF token from `/api/auth/csrf` in the `X-CSRF-Token` header. The main site and authentication page obtain and send this token automatically.

The API has global, administrator, and upload-specific rate limits. Failed sign-ins are temporarily blocked by IP after five failures, and state-changing API requests are written to the server audit log without recording request bodies or passwords.

Poll votes are stored in SQLite and each authenticated account can vote only once. Media uploads are accepted only from administrators, limited to 50 MB, restricted to image/video MIME types, and stored in the ignored `uploads/` directory. Poll and media data are served through `/api/poll` and `/api/media`.

For production, use HTTPS, set `NODE_ENV=production`, keep `.env` private, use a managed database and object storage for uploads, and add backups, email verification, password reset, and two-factor authentication. A Cloudflare WAF requires placing your own domain behind Cloudflare and pointing its DNS to Railway; it cannot be enabled from this repository alone.

## Render deployment

The included `Dockerfile` and `render.yaml` provide a production deployment starting point. Push this folder to GitHub, create a new Blueprint in Render, and select the repository. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` as private Render environment variables. Render supplies HTTPS automatically; add a custom domain in the Render service settings if you have one.

The blueprint uses a persistent disk for SQLite, sessions, and local uploads. For a larger public site, move media to object storage and use a managed database with automated backups.
