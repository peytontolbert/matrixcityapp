# Matrix Games accounts

The static website uses a separate Node.js/PostgreSQL account API. The VPS runs
the service on loopback port 4190. Cloudflare's `api.matrixgames.app` published
application forwards HTTP to `127.0.0.1:4190`.

Create a Google OAuth Web application client and register exactly
`https://api.matrixgames.app/api/callback`. The API performs the code exchange
directly; no Azure callback relay is needed. Only `openid email profile` is used.
No Google JavaScript library or client secret is sent to the browser.

Runtime variables: NODE_ENV=production, PORT=4190,
APP_ORIGIN=https://matrixgames.app, API_ORIGIN=https://api.matrixgames.app,
DATABASE_URL, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET. Keep the last three in
root-only VPS configuration, never in repository files or GitHub Actions.
An API with missing Google credentials reports sign-in unavailable.

The PostgreSQL schema stores users keyed by Google's stable subject identifier,
hashed session tokens, expiring single-use OAuth state, nonce, PKCE verifier,
and hashed rate-limit keys. Sessions last 30 days; pending login state lasts ten
minutes. Expired rows are removed periodically. Secure HttpOnly host-only cookies
are restricted to the API host. State, nonce, issuer, audience, signature and
verified email are checked before a session is created. Logout is POST-only and
requires an exact allowed Origin and JSON content type.

Account CORS allows only matrixgames.app and www.matrixgames.app. The Azure
preview hostname links to the primary domain for accounts, avoiding third-party
cookie dependence. API request limits include per-client and global caps; login
starts are limited to ten per client per ten minutes. The loopback-only listener
trusts Cloudflare's connecting-IP header supplied by the local tunnel.

Run `npm ci --prefix api`, then `npm test --prefix api` with TEST_DATABASE_URL
pointing to an isolated PostgreSQL database. Tests truncate only a database whose
name ends in `_test`. Apply `npm run migrate --prefix api` to the new service
database before activation. Back up existing data and configuration before any
subsequent update. Deploy versioned releases and retain the previous release for
rollback; do not restart other applications or tunnels.

The frontend workflow deploys only `dist/`; `api/` code and dependencies are not
included. API deployment is a separate tested VPS release. Google console
configuration and a real account-owner sign-in must be verified before claiming
the complete Google flow works.
