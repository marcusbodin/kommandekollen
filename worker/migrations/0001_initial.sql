PRAGMA foreign_keys = ON;
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  filters TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('unverified','pending','approved','rejected','revoked')),
  application TEXT NOT NULL,
  owner_slot INTEGER NOT NULL DEFAULT 0 CHECK(owner_slot IN (0,1)),
  alerts_enabled INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT NOT NULL UNIQUE,
  token_expires INTEGER NOT NULL,
  token_used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  activated_at INTEGER,
  expires_at INTEGER NOT NULL,
  last_digest_day TEXT,
  consent_version TEXT NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TRIGGER subscription_capacity BEFORE INSERT ON subscriptions
WHEN (SELECT count(*) FROM subscriptions) >= 40
OR (NEW.owner_slot=0 AND (SELECT count(*) FROM subscriptions WHERE owner_slot=0)>=39)
BEGIN SELECT RAISE(ABORT, 'capacity'); END;
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE listings (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  data TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX listings_source ON listings(source_id, active);
CREATE TRIGGER inventory_capacity BEFORE INSERT ON listings
WHEN NOT EXISTS(SELECT 1 FROM listings WHERE id = NEW.id)
AND (SELECT count(*) FROM listings) >= 200
BEGIN SELECT RAISE(ABORT, 'inventory_capacity'); END;
CREATE TABLE source_runs (
  source_id TEXT PRIMARY KEY,
  last_attempt TEXT NOT NULL,
  last_success TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  item_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE outbox (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('verification','notice','digest')),
  day TEXT NOT NULL,
  payload TEXT NOT NULL,
  listing_ids TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','expired')),
  created_at INTEGER NOT NULL,
  first_attempt INTEGER,
  next_attempt INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  provider_id TEXT,
  UNIQUE(subscription_id, kind, day)
);
CREATE INDEX outbox_pending ON outbox(state,next_attempt);
CREATE TABLE seen (
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY(subscription_id, listing_id)
);
CREATE TABLE quotas (period TEXT PRIMARY KEY, total INTEGER NOT NULL DEFAULT 0, verification INTEGER NOT NULL DEFAULT 0);
CREATE TABLE send_attempts (
  id TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL,
  day TEXT NOT NULL,
  month TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TRIGGER reserve_quota BEFORE INSERT ON send_attempts
BEGIN
  INSERT OR IGNORE INTO quotas(period) VALUES(NEW.day);
  INSERT OR IGNORE INTO quotas(period) VALUES(NEW.month);
  SELECT CASE WHEN (SELECT total FROM quotas WHERE period=NEW.day) >= 80
    OR (SELECT total FROM quotas WHERE period=NEW.month) >= 2400
    OR (NEW.kind!='digest' AND (SELECT verification FROM quotas WHERE period=NEW.day) >= 20)
    THEN RAISE(ABORT, 'mail_quota') END;
  UPDATE quotas SET total=total+1, verification=verification+(NEW.kind!='digest')
    WHERE period IN (NEW.day,NEW.month);
END;
