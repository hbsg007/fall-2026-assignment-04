---
name: erd-generator
description: Designs a database Entity-Relationship Diagram (ERD) from a plain-language domain description, writes it as Mermaid erDiagram syntax to docs/architecture/schema.mmd, validates and renders it to docs/architecture/erd.svg with a local script, and self-corrects syntax errors. Use when the user asks to design, draft, model, or diagram an ERD, a data model, a database schema, entities and relationships, or an architecture/database diagram.
---

# ERD Generator

Turn a domain description into a validated Mermaid ERD and a rendered SVG.
Never hand back a diagram that has not passed the render script.

## Files

| Path | Purpose |
| --- | --- |
| `docs/architecture/schema.mmd` | Mermaid `erDiagram` source you write |
| `docs/architecture/erd.svg` | Rendered diagram produced by the script |
| `.agent/skills/erd-generator/scripts/render_erd.js` | Validator + SVG compiler (wraps `npx mmdc`) |

All commands run from the **repository root**.

## Workflow

### 1. Parse the requirements

From the user's description, list before writing any Mermaid:

- **Entities** — singular business concepts, written in Mermaid as UPPER_SNAKE_CASE plurals (`USERS`, `BOOKS`, `BOOK_AUTHORS`).
- **Attributes** — each with a type (`int`, `string`, `text`, `date`, `timestamp`, `boolean`, `decimal`, `uuid`).
- **Keys** — exactly one `PK` per entity (`int id PK`); every foreign key is `int <entity>_id FK` and points at an existing PK. A column that is both is written `PK, FK`.
- **Cardinalities** — decide for every relationship which side is "one" and which is "many":
  - `||--o{` one-to-many (one parent, zero or more children)
  - `||--|{` one-to-one-or-more
  - `||--o|` one-to-zero-or-one (the child FK will be unique)
  - `||--||` exactly one-to-one
  - Many-to-many is never drawn directly: create a junction entity with two `||--o{` relationships into it.

If the user states that an entity **already exists** (for example in an existing migration under `src/db/migrations/`), read that migration and reproduce its columns exactly in the ERD so downstream code stays consistent. Do not rename or retype existing columns.

Resolve ambiguity with explicit, reasonable business decisions and list them for the user in the final answer.

### 2. Write the Mermaid file

Write the diagram to `docs/architecture/schema.mmd` (create `docs/architecture/` if needed). The file contains **only** Mermaid source — no Markdown code fences.

Syntax rules that prevent most render failures:

- First line is exactly `erDiagram`.
- Relationship lines need a label after a colon: `USERS ||--o{ LOANS : places`. Quote multi-word labels: `: "is written by"`.
- Attribute blocks use `type name` pairs, one per line, inside `{ }`, with optional key markers `PK`, `FK`, `UK` and an optional quoted comment.
- Entity and attribute names contain only letters, digits, `_` and `-` — no spaces, dots or parentheses (write `decimal`, not `decimal(10,2)`).

Example:

~~~
erDiagram
    USERS ||--o{ LOANS : places
    USERS {
        int id PK
        string email UK
    }
    LOANS {
        int id PK
        int user_id FK
        date due_date
    }
~~~

### 3. Validate and render

Run:

~~~bash
node .agent/skills/erd-generator/scripts/render_erd.js docs/architecture/schema.mmd
~~~

- Prints `SUCCESS` and exits `0` → `docs/architecture/erd.svg` was written. Go to step 5.
- Prints `SYNTAX_ERROR:` and exits `1` → go to step 4.

### 4. Self-correction loop (max 3 retries)

1. Read the `SYNTAX_ERROR` trace. Mermaid reports the line number, the offending snippet, and the token it expected (for example `Expecting 'COLON'` means a relationship label is missing its `:`).
2. Fix only the faulty lines in `docs/architecture/schema.mmd` while keeping the data model unchanged.
3. Re-run the script from step 3.

Track attempts. After 3 failed retries, stop, show the user the last error and the current `schema.mmd`, and explain what you tried. Do not claim success without a `SUCCESS` result.

### 5. Final output

Reply with:

1. The raw Mermaid source, in a fenced code block tagged `mermaid`, exactly as saved in `docs/architecture/schema.mmd`.
2. The rendered asset path: `docs/architecture/erd.svg`.
3. A short list of the business decisions and cardinalities you chose.
4. How many self-correction retries were needed (0 if it rendered first time).
