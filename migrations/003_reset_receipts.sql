CREATE TABLE reset_receipts (
  request_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL REFERENCES users(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  backup_file TEXT NOT NULL
);
