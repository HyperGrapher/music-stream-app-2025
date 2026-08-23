# Normalize media assets and content relations

The application will represent uploaded objects as lifecycle-managed media assets, releases and playlists as separate ordered collection concepts, and likes/reposts as concrete per-content relations. This replaces embedded storage fields, boolean privacy, direct album membership, and nullable polymorphic reactions so ownership and relational invariants are enforceable by the database instead of application convention.
