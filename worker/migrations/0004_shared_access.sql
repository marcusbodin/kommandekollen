CREATE TABLE guest_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  credential_version TEXT NOT NULL,
  member_id TEXT REFERENCES subscriptions(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  draft_version INTEGER NOT NULL DEFAULT 0,
  draft_id TEXT,
  draft_nonce TEXT
);
CREATE INDEX guest_expiry ON guest_sessions(expires_at);
CREATE TRIGGER guest_capacity BEFORE INSERT ON guest_sessions
WHEN (SELECT count(*) FROM guest_sessions)>=200
BEGIN SELECT RAISE(ABORT, 'guest_capacity'); END;
CREATE TABLE guest_drafts (
  guest_id TEXT PRIMARY KEY REFERENCES guest_sessions(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  profile TEXT NOT NULL,
  question TEXT NOT NULL,
  conflicts TEXT NOT NULL,
  turns INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working','ready')),
  expires_at INTEGER NOT NULL
);
CREATE TABLE guest_saves (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL UNIQUE REFERENCES guest_sessions(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  draft_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  saved_version INTEGER NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  accept_unverified INTEGER NOT NULL CHECK(accept_unverified IN (0,1)),
  verified INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE TABLE gate_logins (
  token_hash TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TRIGGER revoke_guest_access AFTER UPDATE OF state ON subscriptions
WHEN NEW.state IN ('rejected','revoked')
BEGIN
  DELETE FROM guest_sessions WHERE member_id=NEW.id OR id IN (
    SELECT guest_id FROM guest_saves WHERE member_id=NEW.id
    UNION SELECT guest_id FROM gate_logins WHERE member_id=NEW.id
  );
END;
CREATE TRIGGER delete_guest_access BEFORE DELETE ON subscriptions
BEGIN
  DELETE FROM guest_sessions WHERE id IN (
    SELECT guest_id FROM guest_saves WHERE member_id=OLD.id
    UNION SELECT guest_id FROM gate_logins WHERE member_id=OLD.id
  );
END;
