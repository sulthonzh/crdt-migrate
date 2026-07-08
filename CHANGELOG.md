# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **UUIDGenerator security** — Replaced `Math.random()` with `crypto.randomUUID()` for cryptographically secure UUID generation
- **Backup path bug** — `createBackup()` had confusing fallback to `test-database.db` when `databasePath` was missing; now uses the actual configured database path
- **Placeholder estimation** — `estimateMigrationTime()` always returned '1-2 minutes'; now calculates based on schema complexity (tables + columns + FKs)
- **Missing UNIQUE detection** — Analyzer didn't detect UNIQUE constraints on columns; now queries `PRAGMA index_list` + `PRAGMA index_info` to populate `col.unique`
- **`any` type usage** — Replaced all `any` types in analyzer.ts and logger.ts with proper types (`ConstraintInfo[]`, `ForeignKeyInfo[]`, `Record<string, unknown>[]`, `unknown[]`)

### Added
- Local ESLint config (`eslint.config.mjs`) — project no longer depends on parent's broken config
- 36 new tests (17 → 53): Logger (12), UUIDGenerator (5), edge-cases (19)
  - Logger: all log levels, silent/verbose modes, data output, Unicode/special chars, empty arrays
  - UUIDGenerator: v4 format validation, uniqueness (1000 UUIDs), version/variant bits, length
  - Edge cases: composite PKs, no PK, TEXT PK, PK-only tables, multiple data types, self-referencing FKs, empty files, UNIQUE constraints, migration/preview failure paths, large databases (>10 tables), FK complexity warnings, migration time estimation tiers

### Changed
- Coverage: 94.62% → 98.48% statements, 82.64% → 88.46% branches, 95.23% → 100% functions

## [1.0.0] - 2026-06-18

### Added
- `analyze` command — scans SQLite databases for CRDT compatibility issues
- `migrate` command — automatically converts schemas to CRDT-compatible format
- `preview` command — generates migration SQL without executing changes
- Primary key conversion (INTEGER AUTOINCREMENT → TEXT UUID)
- Foreign key chain updates with UUID references
- Default value generation for NOT NULL columns
- Dry run mode for safe testing
- Backup support with timestamped copies
- Verbose output mode for debugging
- 17 tests (6 analyzer, 6 migrator, 5 CLI) — 100% pass rate
- 96.22% statement coverage, 86.4% branch coverage

### Dependencies
- `commander` — CLI framework
- `sqlite3` — SQLite database driver

[1.0.0]: https://github.com/sulthonzh/crdt-migrate/releases/tag/v1.0.0
