CREATE TABLE private_listing_observations (
  listing_id TEXT PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE
);
CREATE TABLE source_ingestion_state (
  source_id TEXT PRIMARY KEY,
  last_complete_at TEXT,
  last_complete_hash TEXT
);
INSERT INTO source_ingestion_state(source_id,last_complete_at)
  SELECT source_id,strftime('%Y-%m-%dT%H:%M:%fZ',last_success) FROM source_runs;
CREATE TABLE ingestion_receipts (
  source_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('complete','partial')),
  observed_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  payload TEXT NOT NULL,
  inserted INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER NOT NULL DEFAULT 0,
  retired INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(source_id,batch_id)
);
CREATE INDEX receipt_expiry ON ingestion_receipts(received_at);
CREATE TRIGGER receipt_conflict BEFORE INSERT ON ingestion_receipts
WHEN EXISTS(SELECT 1 FROM ingestion_receipts WHERE source_id=NEW.source_id AND batch_id=NEW.batch_id AND payload_hash!=NEW.payload_hash)
BEGIN SELECT RAISE(ABORT, 'observation_conflict'); END;
CREATE TRIGGER ingest_observed_batch AFTER INSERT ON ingestion_receipts
BEGIN
  INSERT OR IGNORE INTO source_ingestion_state(source_id) VALUES(NEW.source_id);
  SELECT CASE WHEN NEW.kind='complete' AND NEW.observed_at<=COALESCE(
    (SELECT last_complete_at FROM source_ingestion_state WHERE source_id=NEW.source_id),'')
    THEN RAISE(ABORT, 'stale_snapshot') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM json_each(NEW.payload) j JOIN listings l ON l.id=NEW.source_id||':'||json_extract(j.value,'$.externalId')
    WHERE julianday(l.last_seen)=julianday(NEW.observed_at) AND l.data!=json(j.value)
    AND NEW.observed_at>=COALESCE((SELECT last_complete_at FROM source_ingestion_state WHERE source_id=NEW.source_id),'')
  ) THEN RAISE(ABORT, 'observation_conflict') END;
  INSERT INTO rate_limits(key,count,expires_at)
    VALUES('ingest:'||NEW.source_id||':'||(NEW.received_at/300000),1,NEW.received_at+600000)
    ON CONFLICT(key) DO UPDATE SET count=count+1;
  SELECT CASE WHEN (SELECT count FROM rate_limits WHERE key='ingest:'||NEW.source_id||':'||(NEW.received_at/300000))>1
    THEN RAISE(ABORT, 'source_rate') END;
  UPDATE ingestion_receipts SET
    inserted=(SELECT count(*) FROM json_each(NEW.payload) j
      WHERE NOT EXISTS(SELECT 1 FROM listings WHERE id=NEW.source_id||':'||json_extract(j.value,'$.externalId'))
      AND (NEW.kind='complete' OR NEW.observed_at>COALESCE((SELECT last_complete_at FROM source_ingestion_state WHERE source_id=NEW.source_id),''))),
    updated=(SELECT count(*) FROM json_each(NEW.payload) j JOIN listings l ON l.id=NEW.source_id||':'||json_extract(j.value,'$.externalId')
      WHERE (julianday(l.last_seen)<julianday(NEW.observed_at) OR (NEW.kind='complete' AND julianday(l.last_seen)=julianday(NEW.observed_at)))
      AND (NEW.kind='complete' OR NEW.observed_at>COALESCE((SELECT last_complete_at FROM source_ingestion_state WHERE source_id=NEW.source_id),''))),
    retired=(SELECT count(*) FROM listings l WHERE NEW.kind='complete' AND l.source_id=NEW.source_id
      AND l.active=1 AND julianday(l.last_seen)<=julianday(NEW.observed_at)
      AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload) j WHERE l.id=NEW.source_id||':'||json_extract(j.value,'$.externalId')))
    WHERE source_id=NEW.source_id AND batch_id=NEW.batch_id;
  UPDATE listings SET active=0 WHERE NEW.kind='complete' AND source_id=NEW.source_id AND julianday(last_seen)<=julianday(NEW.observed_at)
    AND NOT EXISTS(SELECT 1 FROM json_each(NEW.payload) j WHERE listings.id=NEW.source_id||':'||json_extract(j.value,'$.externalId'));
  INSERT INTO listings(id,source_id,data,first_seen,last_seen,active)
    SELECT NEW.source_id||':'||json_extract(j.value,'$.externalId'),NEW.source_id,json(j.value),NEW.observed_at,NEW.observed_at,1
    FROM json_each(NEW.payload) j
    WHERE (NEW.kind='complete' OR NEW.observed_at>COALESCE((SELECT last_complete_at FROM source_ingestion_state WHERE source_id=NEW.source_id),''))
      AND NOT EXISTS(SELECT 1 FROM listings l WHERE l.id=NEW.source_id||':'||json_extract(j.value,'$.externalId')
        AND (julianday(l.last_seen)>julianday(NEW.observed_at) OR (NEW.kind='partial' AND julianday(l.last_seen)=julianday(NEW.observed_at))))
    ON CONFLICT(id) DO UPDATE SET data=excluded.data,last_seen=excluded.last_seen,active=1;
  INSERT OR IGNORE INTO private_listing_observations(listing_id)
    SELECT l.id FROM listings l JOIN json_each(NEW.payload) j ON l.id=NEW.source_id||':'||json_extract(j.value,'$.externalId')
    WHERE NEW.kind='partial' AND julianday(l.last_seen)=julianday(NEW.observed_at) AND l.active=1
      AND NEW.observed_at>COALESCE((SELECT last_complete_at FROM source_ingestion_state WHERE source_id=NEW.source_id),'');
  DELETE FROM private_listing_observations WHERE NEW.kind='complete'
    AND listing_id IN (SELECT l.id FROM listings l JOIN json_each(NEW.payload) j ON l.id=NEW.source_id||':'||json_extract(j.value,'$.externalId')
      WHERE julianday(l.last_seen)=julianday(NEW.observed_at));
  UPDATE source_ingestion_state SET last_complete_at=NEW.observed_at,last_complete_hash=NEW.payload_hash
    WHERE source_id=NEW.source_id AND NEW.kind='complete';
  INSERT INTO source_runs(source_id,last_attempt,last_success,status,item_count)
    VALUES(NEW.source_id,NEW.observed_at,NEW.observed_at,CASE WHEN NEW.kind='partial' THEN 'partial' ELSE 'ok' END,json_array_length(NEW.payload))
    ON CONFLICT(source_id) DO UPDATE SET
      status=CASE WHEN julianday(excluded.last_attempt)>julianday(source_runs.last_attempt) THEN excluded.status ELSE source_runs.status END,
      error_code=CASE WHEN julianday(excluded.last_attempt)>julianday(source_runs.last_attempt) THEN NULL ELSE source_runs.error_code END,
      item_count=CASE WHEN julianday(excluded.last_success)>COALESCE(julianday(source_runs.last_success),0) THEN excluded.item_count ELSE source_runs.item_count END,
      last_attempt=CASE WHEN julianday(excluded.last_attempt)>julianday(source_runs.last_attempt) THEN excluded.last_attempt ELSE source_runs.last_attempt END,
      last_success=CASE WHEN julianday(excluded.last_success)>COALESCE(julianday(source_runs.last_success),0) THEN excluded.last_success ELSE source_runs.last_success END;
  UPDATE ingestion_receipts SET ignored=json_array_length(payload)-inserted-updated,payload=''
    WHERE source_id=NEW.source_id AND batch_id=NEW.batch_id;
END;
