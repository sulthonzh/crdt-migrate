# crdt-migrate

**Migrate SQLite databases to CRDT-compatible schemas automatically.** Convert auto-increment primary keys to UUIDs, fix foreign key chains, add defaults — all while preserving your data. Zero manual schema rewriting.

## 🎯 The Problem

Local-first is booming in 2026 (CRDTs, SQLite sync engines, offline-first apps). But adopting CRDT-based sync requires strict schema patterns:

- **Primary keys must be TEXT UUIDs** (not auto-increment INTEGERs)
- **All NOT NULL columns need DEFAULT values**  
- **Foreign keys must cascade to new UUID-based references**
- **No auto-incrementing primary keys** (causes multi-device conflicts)

Converting an existing database to meet these requirements is pure pain. You're manually rewriting schema, updating all foreign key chains, preserving data integrity. There is literally no tool for this — zero search results.

## ✨ The Solution

`crdt-migrate` is a CLI tool that takes your existing SQLite database and **automatically migrates it to be CRDT-compatible**.

```bash
npx crdt-migrate ./myapp.db
# → Analyzes schema
# → Converts INT primary keys to UUIDs
# → Updates all foreign key references
# → Adds DEFAULT values where missing
# → Preserves all existing data
# → Outputs migration SQL + new CRDT-ready database
```

Think `prisma migrate` but for the local-first world.

## 🚀 Quick Start

### Installation

```bash
npm install -g crdt-migrate
```

or use npx:

```bash
npx crdt-migrate
```

### Basic Usage

1. **Analyze your database**:
   ```bash
   crdt-migrate analyze ./myapp.db
   ```

2. **Preview the migration**:
   ```bash
   crdt-migrate preview ./myapp.db --output ./migration-preview
   ```

3. **Execute the migration**:
   ```bash
   crdt-migrate migrate ./myapp.db --output ./migration --backup
   ```

## 📋 Commands

### `analyze`

Analyze a database for CRDT compatibility.

```bash
crdt-migrate analyze <database> [options]
```

**Options:**
- `--verbose` - Show detailed analysis output

**Example:**
```bash
crdt-migrate analyze ./myapp.db --verbose
```

### `migrate`

Migrate a database to CRDT-compatible schema.

```bash
crdt-migrate migrate <database> [options]
```

**Options:**
- `--output <dir>` - Output directory for migration files (default: `./migration`)
- `--dry-run` - Perform a dry run without making changes
- `--backup` - Create a backup of the original database
- `--verbose` - Show detailed migration output

**Example:**
```bash
crdt-migrate migrate ./myapp.db --output ./migration --backup --dry-run
```

### `preview`

Preview the migration changes without executing them.

```bash
crdt-migrate preview <database> [options]
```

**Options:**
- `--output <dir>` - Output directory for preview files (default: `./preview`)
- `--verbose` - Show detailed preview output

**Example:**
```bash
crdt-migrate preview ./myapp.db --output ./preview --verbose
```

## 🔧 Features

### ✅ What It Handles

- **Primary Key Conversion**: Automatically converts auto-increment INTEGER primary keys to TEXT UUIDs
- **Foreign Key Updates**: Updates all foreign key references to use UUID-based relationships
- **Default Values**: Adds appropriate DEFAULT values for nullable columns
- **Data Preservation**: All existing data is preserved during migration
- **Schema Validation**: Validates the final schema for CRDT compatibility
- **Backup Support**: Creates safe backups before making changes
- **Dry Run Mode**: Preview changes before execution

### 🚫 What It Doesn't Handle (Yet)

- **PostgreSQL databases** (SQLite only for now)
- **Complex triggers and stored procedures**
- **Custom SQL functions**
- **Advanced data types** (BLOB, JSON with custom parsing)

## 📊 Output Format

### Analysis Output

```json
{
  "databasePath": "./myapp.db",
  "totalTables": 5,
  "needsMigration": true,
  "issues": [
    {
      "type": "AUTO_INCREMENT_PRIMARY_KEY",
      "message": "Table \"users\" has auto-increment primary key",
      "details": "CRDT databases require UUID primary keys instead of auto-incrementing integers",
      "table": "users",
      "column": "id"
    }
  ],
  "summary": "Migration required. Issues: 1 AUTO_INCREMENT_PRIMARY_KEY"
}
```

### Migration Output

```json
{
  "success": true,
  "message": "Migration completed successfully",
  "backupFile": "./migration/backup-2024-06-18T03-47-00.db",
  "sqlFiles": [
    "./migration/migration-2024-06-18T03-47-00.sql",
    "./migration/table-users-2024-06-18T03-47-00.sql",
    "./migration/table-posts-2024-06-18T03-47-00.sql"
  ],
  "tablesMigrated": 3,
  "issuesResolved": 8,
  "warnings": [
    "Foreign key constraints may require manual review after migration"
  ]
}
```

## 🏗️ Technical Details

### Schema Conversion Process

1. **Analysis**: Scans all tables for CRDT compatibility issues
2. **Schema Generation**: Creates new tables with UUID primary keys and proper constraints
3. **Data Migration**: Copies existing data and generates UUIDs for primary keys
4. **Constraint Updates**: Rebuilds foreign key relationships with UUID references
5. **Cleanup**: Drops old tables and applies final optimizations

### UUID Generation

Uses RFC 4122 compliant UUIDs (version 4) with the format:
```
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

### Foreign Key Handling

- Preserves all existing foreign key relationships
- Updates references to use UUID-based primary keys
- Maintains ON DELETE and ON UPDATE actions
- Handles cascading updates appropriately

## 🔒 Safety Features

- **Dry Run Mode**: Test migrations before applying them
- **Automatic Backups**: Creates timestamped backups of original databases
- **Schema Validation**: Ensures final schema meets CRDT requirements
- **Transaction Support**: All changes are atomic and reversible

## 🎯 Use Cases

### For Local-First Apps

- **NOMAD** (30K stars) - offline survival AI
- **llama.cpp** (115K stars) - local-first AI inference
- **SQLite-sync** - CRDT extension for SQLite
- **PowerSync** - enterprise SQLite sync
- **ElectricSQL** - Postgres to SQLite sync

### For Teams Adopting CRDTs

- Migrating existing SQLite applications to sync architectures
- Preparing databases for offline-first capabilities
- Implementing conflict-free replication
- Setting up multi-device data synchronization

## 📈 Why Now?

- **Local-first is exploding**: CRDT frameworks gaining massive traction
- **Enterprise adoption**: Major companies adopting offline-first strategies
- **Sync ecosystem成熟**: Multiple production-ready sync frameworks available
- **Migration gap**: No existing tools for this critical conversion process

## 🛠️ Development

### Building from Source

```bash
git clone https://github.com/sulthonzh/crdt-migrate.git
cd crdt-migrate
npm install
npm run build
npm test
```

### Running Tests

```bash
npm test
npm run test:coverage
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## 🤝 Contributing

We love contributions! Here's how you can help:

1. **Report bugs**: Open an issue with detailed reproduction steps
2. **Suggest features**: Tell us what CRDT migration features you need
3. **Submit PRs**: Fix bugs, add features, or improve documentation
4. **Share feedback**: Let us know what works and what doesn't

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the growing local-first software movement
- Built to solve real pain points in CRDT adoption
- With thanks to the SQLite and CRDT communities

---

**Migrate with confidence. Sync without fear.** 🚀