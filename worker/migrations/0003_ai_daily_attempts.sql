DROP TRIGGER ai_budget;

CREATE TRIGGER ai_budget BEFORE INSERT ON ai_attempts
WHEN (SELECT COALESCE(sum(reserved),0) FROM ai_attempts WHERE day=NEW.day)>=6000
  OR (SELECT count(*) FROM ai_attempts WHERE day=NEW.day AND member_hash=NEW.member_hash)>=6
  OR (SELECT count(*) FROM ai_attempts WHERE day=NEW.day AND ip_hash=NEW.ip_hash)>=6
  OR (SELECT count(*) FROM ai_attempts WHERE state!='done')>=2
  OR EXISTS(SELECT 1 FROM ai_attempts WHERE member_hash=NEW.member_hash AND state!='done')
BEGIN
  SELECT RAISE(ABORT, 'ai_budget');
END;
