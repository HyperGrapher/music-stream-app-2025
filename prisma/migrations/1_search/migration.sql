-- Search (PRD 10.2, SE-4): Postgres full-text search with weights plus pg_trgm for typo tolerance and prefixes.
-- Expression indexes (no new columns): the IMMUTABLE wrappers below are used by both the indexes and the queries.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION ms_track_tsv(title text, artist text, genre text, tags text[], descr text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('simple', coalesce(title, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(artist, '')), 'B')
      || setweight(to_tsvector('simple', coalesce(genre, '') || ' ' || coalesce(array_to_string(tags, ' '), '')), 'C')
      || setweight(to_tsvector('simple', coalesce(descr, '')), 'D')
$$;

CREATE OR REPLACE FUNCTION ms_user_tsv(name text, username text, bio text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT setweight(to_tsvector('simple', coalesce(name, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(username, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(bio, '')), 'D')
$$;

CREATE INDEX "track_search_tsv_idx" ON "track" USING GIN (ms_track_tsv("title", "artistName", "genre", "tags", "description"));
CREATE INDEX "track_title_trgm_idx" ON "track" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "collection_search_tsv_idx" ON "collection" USING GIN (ms_track_tsv("title", NULL, "genre", "tags", "description"));
CREATE INDEX "collection_title_trgm_idx" ON "collection" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "user_search_tsv_idx" ON "user" USING GIN (ms_user_tsv("name", "username", "bio"));
CREATE INDEX "user_name_trgm_idx" ON "user" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "user_username_trgm_idx" ON "user" USING GIN ("username" gin_trgm_ops);
