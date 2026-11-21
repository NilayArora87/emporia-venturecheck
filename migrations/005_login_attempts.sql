CREATE TABLE login_attempts (
  address TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  until_ms INTEGER NOT NULL
);
