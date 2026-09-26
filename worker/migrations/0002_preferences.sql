ALTER TABLE subscriptions ADD COLUMN preference_profile TEXT;
ALTER TABLE subscriptions ADD COLUMN search_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN draft_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN draft_id TEXT;
ALTER TABLE subscriptions ADD COLUMN draft_nonce TEXT;
ALTER TABLE subscriptions ADD COLUMN search_commit TEXT;
ALTER TABLE outbox ADD COLUMN search_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE search_drafts (
  member_id TEXT PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  base_version INTEGER NOT NULL,
  profile TEXT NOT NULL,
  question TEXT NOT NULL,
  conflicts TEXT NOT NULL,
  turns INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('working','ready')),
  expires_at INTEGER NOT NULL
);
CREATE TRIGGER revoke_search_drafts AFTER UPDATE OF state ON subscriptions
WHEN NEW.state!='approved'
BEGIN
  DELETE FROM search_drafts WHERE member_id=NEW.id;
END;
CREATE TABLE ai_attempts (
  id TEXT PRIMARY KEY,
  member_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  reserved INTEGER NOT NULL CHECK(reserved=1000),
  state TEXT NOT NULL CHECK(state IN ('running','done','uncertain'))
);
CREATE INDEX ai_attempts_day ON ai_attempts(day);
CREATE TRIGGER ai_budget BEFORE INSERT ON ai_attempts
WHEN (SELECT COALESCE(sum(reserved),0) FROM ai_attempts WHERE day=NEW.day)>=6000
  OR (SELECT count(*) FROM ai_attempts WHERE day=NEW.day AND member_hash=NEW.member_hash)>=3
  OR (SELECT count(*) FROM ai_attempts WHERE day=NEW.day AND ip_hash=NEW.ip_hash)>=3
  OR (SELECT count(*) FROM ai_attempts WHERE state!='done')>=2
  OR EXISTS(SELECT 1 FROM ai_attempts WHERE member_hash=NEW.member_hash AND state!='done')
BEGIN
  SELECT RAISE(ABORT, 'ai_budget');
END;
