-- One row holding the number of plates downloaded.
CREATE TABLE IF NOT EXISTS counter (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL);
INSERT OR IGNORE INTO counter (id, n) VALUES (1, 0);
