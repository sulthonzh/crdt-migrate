# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-18

### Added
- CLI tool for analyzing SQLite databases for CRDT compatibility
- `analyze` command — identifies auto-increment PKs, non-TEXT PKs, nullable columns without defaults, and foreign key constraints
- `migrate` command — generates and executes migration SQL to convert schemas to CRDT-compatible format (UUID TEXT primary keys)
- `preview` command — dry-run preview of migration changes without executing them
- Backup support (`--backup` flag) for safe migrations
- Data migration scripts that run before schema changes to preserve referential integrity
- Support for composite primary keys and complex foreign key relationships
- Verbose output mode (`--verbose` flag)

### Technical Details
- TypeScript strict mode with `exactOptionalPropertyTypes` enabled
- 17 tests across 3 test suites (analyzer, migrator, CLI)
- 96.22% statement coverage, 86.4% branch coverage
- Dependencies: commander (CLI), sqlite3 (database)
- Dev dependencies: vitest, tsup, typescript, eslint
