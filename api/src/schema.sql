CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, google_sub text NOT NULL UNIQUE, email text NOT NULL,
 name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS oauth_states (
 hash text PRIMARY KEY, nonce text NOT NULL, verifier text NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_states_expiry ON oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS api_rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_expiry ON api_rate_limits(expires_at);
CREATE TABLE IF NOT EXISTS native_setups (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 device_id uuid NOT NULL, settings jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,device_id)
);
