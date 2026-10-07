---
name: kysely-migration-generator
description: Translates a Mermaid ERD (docs/architecture/schema.mmd, or an erd.svg compiled from it) into a type-safe Kysely PostgreSQL migration in src/db/migrations/. Use when the user asks to generate, write, or create a database migration, Kysely migration, tables, or DDL from an ERD, Mermaid diagram, schema.mmd, or data model.
---

# Kysely Migration Generator

Convert a Mermaid `erDiagram` into a Kysely migration that type-checks and runs cleanly with `npm run migrate:up`.

## Inputs

1. Read `docs/architecture/schema.mmd` (preferred). If only `docs/architecture/erd.svg` exists, recover the entities, attributes and relationships from the text in the SVG.
2. Read every file in `src/db/migrations/`. Use `001_initial_schema.ts` as the structural baseline (imports, `db.schema` builder style, `sql` defaults).
3. Note every table that an earlier migration **already creates** (e.g. `users`). Never create those again — new tables may only reference them.

## Translation rules

### Entities → tables

- Table name = entity name in lower snake_case: `USERS` → `users`, `BookAuthors` / `BOOK_AUTHORS` → `book_authors`.
- Column names are lower snake_case.

### Data types

| Mermaid type | Kysely column type |
| --- | --- |
| `int`, `integer` | `'integer'` |
| `string`, `varchar` | `'varchar(255)'` |
| `text` | `'text'` |
| `boolean`, `bool` | `'boolean'` |
| `date` | `'date'` |
| `timestamp`, `datetime` | `'timestamp'` |
| `decimal`, `float`, `money` | `'numeric(10, 2)'` |
| `uuid` | `'uuid'` |

Columns marked `UK` get `.unique()`. Treat a non-key column as `.notNull()` unless the ERD comment says it is optional/nullable. Timestamp columns named `created_at` / `updated_at` get `.defaultTo(sql\`NOW()\`).notNull()`.

### Primary keys

- `int id PK` → `.addColumn('id', 'serial', (col) => col.primaryKey())`
- `uuid id PK` → `.addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql\`gen_random_uuid()\`))`
- Junction tables whose only key is a pair of `PK, FK` columns → add both columns, then `.addPrimaryKeyConstraint('<table>_pkey', ['a_id', 'b_id'])`.

### Foreign keys

- Every `FK` column references the PK of its parent table and cascades on delete:
  `.addColumn('user_id', 'integer', (col) => col.references('users.id').onDelete('cascade').notNull())`
- The FK column type must match the parent PK: `serial` → `'integer'`, `uuid` → `'uuid'`.

### Cardinalities

The foreign key always lives on the child (right-hand, "many"/"optional") side of the relationship.

- `A ||--o{ B` (one-to-many) → FK `a_id` on table `b`, `.notNull()`
- `A ||--|{ B` (one-to-one-or-more) → FK `a_id` on table `b`, `.notNull()`
- `A ||--o| B` (one-to-zero-or-one) → FK `a_id` on table `b`, `.notNull().unique()` — the unique constraint is what enforces "one"
- `A ||--|| B` (one-to-one) → FK `a_id` on table `b`, `.notNull().unique()`
- `A }o--o{ B` (many-to-many) → create junction table `a_b` with two FKs and a composite PK

## Output file

- Path: `src/db/migrations/<timestamp>_<migration_name>.ts`
  - `<timestamp>` = current UTC time as `YYYYMMDDHHmmss` (e.g. `20261007183000`), so it sorts after `001_initial_schema.ts`.
  - `<migration_name>` = short snake_case summary (e.g. `library_schema`).
- Template:

~~~ts
import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // create tables in dependency order: parents before children
}

export async function down(db: Kysely<any>): Promise<void> {
  // drop tables in exact reverse order of up()
}
~~~

## Structural guardrails

1. Export **both** `up(db: Kysely<any>)` and `down(db: Kysely<any>)`, each returning `Promise<void>`.
2. In `up`, create tables in topological order — a table is created only after every table it references.
3. In `down`, drop **only the tables this migration created**, in the exact reverse of the `up` order (children before parents), using `.ifExists()`. Never drop tables owned by earlier migrations (e.g. `users`).
4. Use only `db.schema` builder calls plus `sql` template defaults; no raw string SQL concatenation.
5. Every `.execute()` is awaited.

## Verification (required)

After writing the file, run from the repository root:

~~~bash
npm run build        # must finish with no TypeScript errors
npm run migrate:up   # must print: migration "<file>" was executed successfully
~~~

If either command fails, read the error, fix the migration, and re-run until both pass. If the database is unreachable (e.g. `ECONNREFUSED`), tell the user to start it with `docker compose up -d` rather than changing the code.

Finish by telling the user the migration file path, the tables created in order, and the outcome of both commands.
