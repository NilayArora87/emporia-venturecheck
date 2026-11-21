CREATE TABLE revision_windows(startup_id TEXT PRIMARY KEY REFERENCES startups(id), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)));
CREATE TABLE disabled_accounts(user_id TEXT PRIMARY KEY REFERENCES users(id));
CREATE TABLE admin_activity(id INTEGER PRIMARY KEY, actor TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, subject TEXT NOT NULL, created TEXT NOT NULL);
