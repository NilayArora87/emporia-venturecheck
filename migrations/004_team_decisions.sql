CREATE TABLE team_decisions (
 event_id TEXT NOT NULL REFERENCES events(id),
 team_id TEXT NOT NULL REFERENCES users(id),
 marks INTEGER CHECK(marks BETWEEN 0 AND 100),
 disqualified INTEGER NOT NULL DEFAULT 0 CHECK(disqualified IN (0,1)),
 PRIMARY KEY(event_id,team_id)
);
