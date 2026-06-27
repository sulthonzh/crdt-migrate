# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
