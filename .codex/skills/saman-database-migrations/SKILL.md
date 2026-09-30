---
name: saman-database-migrations
description: Safely design, review, and implement Saman Poolak MySQL/MariaDB schema changes and migration tooling. Use whenever adding or altering tables, columns, indexes, production schema, schema_migrations tracking, or database deployment procedures.
---

# Database Migration Safety

MASTERCONTEXT.md and server/schema.sql define the current project expectations.

Treat production data as valuable and non-replaceable.

## Before changing schema

Inspect:

- server/schema.sql
- server/migrations/
- relevant API routes
- MASTERCONTEXT.md migration notes

Never assume a migration has or has not been applied.

## Migration rules

Prefer:

- additive changes
- explicit ordered migrations
- deterministic execution
- migration tracking
- safe retry behavior

Avoid destructive changes unless explicitly required.

Do not blindly rerun ALTER TABLE statements.

## schema_migrations

Tracked migrations should record at minimum:

- migration identifier
- applied timestamp

The runner must:

1. detect applied migrations
2. apply only pending migrations
3. apply them in deterministic order
4. stop on failure
5. record successful completion

## Fresh installations

Keep server/schema.sql correct for fresh installations.

Migration tooling and fresh-install schema must not silently diverge.

## Production

Never execute live database changes unless explicitly instructed.

Do not assume uploading backend files applies database migrations.

When backend code depends on a schema change, the schema change must be applied before dependent production code is activated.

## Verification

After schema-related changes:

- lint affected PHP
- run applicable validation tests
- verify old data remains compatible
- verify API reads/writes