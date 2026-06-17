#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/index.ts
var import_commander = require("commander");

// src/migrator.ts
var import_sqlite32 = __toESM(require("sqlite3"));
var import_util2 = require("util");
var import_promises = __toESM(require("fs/promises"));
var import_path = __toESM(require("path"));

// src/logger.ts
var Logger = class {
  verbose = false;
  constructor(verbose = false) {
    this.verbose = verbose;
  }
  info(message) {
    console.log(`\x1B[36m\u2139\x1B[0m ${message}`);
  }
  success(message) {
    console.log(`\x1B[32m\u2713\x1B[0m ${message}`);
  }
  warn(message) {
    console.log(`\x1B[33m\u26A0\x1B[0m ${message}`);
  }
  error(message) {
    console.log(`\x1B[31m\u2717\x1B[0m ${message}`);
  }
  debug(message) {
    if (this.verbose) {
      console.log(`\x1B[35m\u{1F50D}\x1B[0m ${message}`);
    }
  }
  table(data) {
    if (this.verbose) {
      console.table(data);
    }
  }
};

// src/analyzer.ts
var import_sqlite3 = __toESM(require("sqlite3"));
var import_util = require("util");
var DatabaseAnalyzer = class {
  db;
  logger;
  options;
  constructor(databasePath, options = { verbose: false }) {
    this.db = new import_sqlite3.default.Database(databasePath);
    this.logger = new Logger(options.verbose);
    this.options = options;
  }
  async analyze() {
    this.logger.info("Starting database analysis...");
    try {
      const tables = await this.getTables();
      const issues = [];
      const tableInfos = [];
      for (const table of tables) {
        const tableInfo = await this.analyzeTable(table);
        tableInfos.push(tableInfo);
        issues.push(...tableInfo.issues);
      }
      const needsMigration = issues.length > 0;
      const analysis = {
        databasePath: this.db.filename || "unknown.db",
        totalTables: tables.length,
        needsMigration,
        issues,
        tables: tableInfos,
        summary: this.generateSummary(issues, needsMigration)
      };
      this.logger.info("Analysis complete");
      this.logger.table(tableInfos.map((t) => ({
        table: t.name,
        hasPrimaryKey: t.hasPrimaryKey,
        primaryKeyType: t.primaryKeyType,
        hasAutoIncrement: t.hasAutoIncrement,
        nullableColumns: t.nullableColumns,
        hasForeignKeys: t.foreignKeys.length > 0,
        issues: t.issues.length
      })));
      return analysis;
    } catch (error) {
      throw new Error(`Analysis failed: ${error}`);
    } finally {
      await this.close();
    }
  }
  async getTables() {
    const sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    const rows = await this.all(sql);
    return rows.map((row) => row.name);
  }
  async analyzeTable(tableName) {
    this.logger.debug(`Analyzing table: ${tableName}`);
    const [columns, constraints, foreignKeys] = await Promise.all([
      this.getTableColumns(tableName),
      this.getTableConstraints(tableName),
      this.getTableForeignKeys(tableName)
    ]);
    const primaryKey = columns.find((col) => col.primaryKey);
    const hasAutoIncrement = !!primaryKey?.autoIncrement;
    const hasPrimaryKey = !!primaryKey;
    const issues = [];
    if (hasAutoIncrement) {
      issues.push({
        type: "AUTO_INCREMENT_PRIMARY_KEY",
        message: `Table "${tableName}" has auto-increment primary key`,
        details: "CRDT databases require UUID primary keys instead of auto-incrementing integers",
        table: tableName,
        column: primaryKey?.name
      });
    }
    if (hasPrimaryKey && primaryKey?.type.toLowerCase() !== "text") {
      issues.push({
        type: "NON_TEXT_PRIMARY_KEY",
        message: `Table "${tableName}" has non-TEXT primary key`,
        details: `Primary key type is "${primaryKey.type}", CRDT requires TEXT`,
        table: tableName,
        column: primaryKey?.name
      });
    }
    const nullableWithoutDefault = columns.filter(
      (col) => !col.notNull && !col.defaultValue && col.name !== primaryKey?.name
    );
    if (nullableWithoutDefault.length > 0) {
      issues.push({
        type: "NULLABLE_WITHOUT_DEFAULT",
        message: `Table "${tableName}" has nullable columns without default values`,
        details: nullableWithoutDefault.map((col) => col.name).join(", "),
        table: tableName
      });
    }
    const foreignKeyIssues = foreignKeys.map((fk) => ({
      table: tableName,
      column: fk.from,
      references: fk.table,
      columnRef: fk.to,
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate
    }));
    if (foreignKeyIssues.length > 0) {
      issues.push({
        type: "FOREIGN_KEY_CONSTRAINTS",
        message: `Table "${tableName}" has foreign key constraints`,
        details: `Foreign keys may need to be updated for UUID references: ${foreignKeyIssues.map((fk) => `${fk.column} \u2192 ${fk.table}.${fk.columnRef}`).join(", ")}`,
        table: tableName,
        foreignKeys: foreignKeyIssues
      });
    }
    return {
      name: tableName,
      columns,
      constraints,
      foreignKeys,
      hasPrimaryKey,
      primaryKeyType: primaryKey?.type,
      hasAutoIncrement,
      nullableColumns: nullableWithoutDefault.map((col) => col.name),
      issues
    };
  }
  async getTableColumns(tableName) {
    const sql = `PRAGMA table_info(${tableName})`;
    const rows = await this.all(sql);
    return rows.map((row) => ({
      name: row.name,
      type: row.type,
      notNull: !!row.notnull,
      defaultValue: row.dflt_value,
      primaryKey: !!row.pk,
      autoIncrement: row.pk && row.type.toLowerCase().includes("integer") ? true : false
    }));
  }
  async getTableConstraints(tableName) {
    const sql = `PRAGMA index_list(${tableName})`;
    const rows = await this.all(sql);
    return rows;
  }
  async getTableForeignKeys(tableName) {
    const sql = `PRAGMA foreign_key_list(${tableName})`;
    const rows = await this.all(sql);
    return rows.map((row) => ({
      from: row.from,
      table: row.table,
      to: row.to,
      onDelete: row.on_delete,
      onUpdate: row.on_update
    }));
  }
  generateSummary(issues, needsMigration) {
    if (!needsMigration) {
      return "Database schema is CRDT-compatible";
    }
    const byType = issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {});
    return `Migration required. Issues: ${Object.entries(byType).map(([type, count]) => `${count} ${type}`).join(", ")}`;
  }
  all(sql) {
    return (0, import_util.promisify)(this.db.all).bind(this.db)(sql);
  }
  close() {
    return (0, import_util.promisify)(this.db.close).bind(this.db)();
  }
};

// src/migrator.ts
var CRDTMigrator = class {
  db;
  logger;
  options;
  analyzer;
  constructor(databasePath, options) {
    this.db = new import_sqlite32.default.Database(databasePath);
    this.logger = new Logger(options.verbose);
    this.options = { ...options, databasePath };
    this.analyzer = new DatabaseAnalyzer(
      databasePath,
      { verbose: options.verbose }
    );
  }
  async close() {
    await (0, import_util2.promisify)(this.db.close.bind(this.db))();
  }
  async migrate() {
    this.logger.info("Starting CRDT migration...");
    try {
      const analysis = await this.analyzer.analyze();
      let backupFile;
      if (this.options.backup) {
        backupFile = await this.createBackup();
        this.logger.info(`Backup created: ${backupFile}`);
      }
      const sqlFiles = await this.generateMigrationSQL(analysis);
      this.logger.info(`Generated ${sqlFiles.length} SQL files`);
      if (this.options.dryRun || this.options.preview) {
        this.logger.info("Dry run completed - no changes made to database");
        return {
          success: true,
          message: "Dry run completed successfully",
          backupFile: backupFile || void 0,
          sqlFiles: this.options.dryRun ? [] : sqlFiles,
          tablesMigrated: analysis.tables.length,
          issuesResolved: analysis.issues.length,
          warnings: this.generateWarnings(analysis)
        };
      }
      await this.executeMigration(sqlFiles, analysis);
      this.logger.info("Migration completed successfully");
      return {
        success: true,
        message: "Migration completed successfully",
        backupFile: backupFile || void 0,
        sqlFiles,
        tablesMigrated: analysis.tables.length,
        issuesResolved: analysis.issues.length,
        warnings: this.generateWarnings(analysis)
      };
    } catch (error) {
      throw new Error(`Migration failed: ${error}`);
    } finally {
      await this.close();
    }
  }
  async preview() {
    this.logger.info("Generating migration preview...");
    try {
      const analysis = await this.analyzer.analyze();
      const sqlFiles = await this.generateMigrationSQL(analysis);
      return {
        databasePath: analysis.databasePath,
        totalTables: analysis.totalTables,
        needsMigration: analysis.needsMigration,
        issues: analysis.issues,
        tables: analysis.tables,
        summary: analysis.summary,
        sqlFiles: sqlFiles.slice(0, 2),
        // Show first 2 SQL files for preview
        estimatedTime: this.estimateMigrationTime(analysis),
        warnings: this.generateWarnings(analysis)
      };
    } catch (error) {
      throw new Error(`Preview generation failed: ${error}`);
    }
  }
  async createBackup() {
    const backupPath = import_path.default.join(
      this.options.outputDir,
      `backup-${Date.now()}.db`
    );
    await import_promises.default.mkdir(import_path.default.dirname(backupPath), { recursive: true });
    const dbPath = this.options.backupFile || this.options.databasePath || import_path.default.join(this.options.outputDir, "test-database.db");
    await import_promises.default.copyFile(dbPath, backupPath);
    return backupPath;
  }
  async generateMigrationSQL(analysis) {
    this.logger.info("Generating migration SQL files...");
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
    const outputDir = this.options.outputDir;
    await import_promises.default.mkdir(outputDir, { recursive: true });
    const sqlFiles = [];
    let mainSQL = `-- CRDT Migration SQL
-- Generated: ${timestamp}
-- Database: ${analysis.databasePath || "unknown.db"}
-- Total tables: ${analysis.totalTables}
-- Issues found: ${analysis.issues.length}

-- Enable foreign key constraints for better data integrity
PRAGMA foreign_keys = ON;

-- Enable recursive triggers for cascading updates
PRAGMA recursive_triggers = ON;

`;
    analysis.tables.forEach((table) => {
      mainSQL += `-- Table: ${table.name}
`;
      mainSQL += `CREATE TABLE ${table.name} (
`;
      table.columns.forEach((col, index) => {
        if (index > 0)
          mainSQL += ",\n";
        let colDef = `  ${col.name} ${col.type}`;
        if (col.notNull && col.name !== "id") {
          colDef += " NOT NULL";
        }
        if (!col.notNull && col.name !== "id" && col.type.toLowerCase() === "text") {
          colDef += ' DEFAULT ""';
        } else if (!col.notNull && col.type.toLowerCase() === "integer") {
          colDef += " DEFAULT 0";
        }
        if (col.unique && col.name !== "id") {
          colDef += " UNIQUE";
        }
        mainSQL += colDef;
      });
      mainSQL += ",\n  PRIMARY KEY (id)";
      table.foreignKeys.forEach((fk) => {
        mainSQL += `,
  FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to})`;
        if (fk.onDelete)
          mainSQL += ` ON DELETE ${fk.onDelete}`;
        if (fk.onUpdate)
          mainSQL += ` ON UPDATE ${fk.onUpdate}`;
      });
      mainSQL += "\n);\n\n";
    });
    let dataSQL = `-- CRDT Data Migration Script
-- Generated: ${timestamp}

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

`;
    analysis.tables.forEach((table) => {
      if (table.hasPrimaryKey && table.primaryKeyType?.toLowerCase() !== "text") {
        const insertSQL = `INSERT INTO ${table.name} (id, `;
        const selectSQL = `SELECT `;
        const columnSQL = "";
        dataSQL += `-- Convert ${table.name} data to UUID
`;
        dataSQL += insertSQL;
        dataSQL += selectSQL;
        dataSQL += ` FROM ${table.name};

`;
      }
    });
    const mainSQLFile = import_path.default.join(outputDir, `migration-${timestamp}.sql`);
    const dataSQLFile = import_path.default.join(outputDir, `data-migration-${timestamp}.sql`);
    await import_promises.default.writeFile(mainSQLFile, mainSQL);
    await import_promises.default.writeFile(dataSQLFile, dataSQL);
    sqlFiles.push(mainSQLFile, dataSQLFile);
    return sqlFiles;
  }
  async executeMigration(sqlFiles, analysis) {
    this.logger.info("Executing migration...");
    const mainSQLFile = sqlFiles.find((f) => f.includes("migration-"));
    if (mainSQLFile) {
      const sql = await import_promises.default.readFile(mainSQLFile, "utf-8");
      await this.executeSQL(sql);
    }
    this.logger.info("Migration executed successfully");
  }
  async executeSQL(sql) {
    await (0, import_util2.promisify)(this.db.exec.bind(this.db))(sql);
  }
  generateWarnings(analysis) {
    const warnings = [];
    if (analysis.issues.length === 0) {
      warnings.push("Database is already CRDT compatible");
    }
    if (analysis.tables.length > 10) {
      warnings.push(`Large database with ${analysis.tables.length} tables may take longer to migrate`);
    }
    analysis.tables.forEach((table) => {
      if (table.foreignKeys.length > 5) {
        warnings.push(`Table ${table.name} has many foreign key constraints - migration may be complex`);
      }
    });
    return warnings;
  }
  estimateMigrationTime(_analysis) {
    return "1-2 minutes";
  }
};

// src/index.ts
var program = new import_commander.Command();
var logger = new Logger();
program.name("crdt-migrate").description("CLI tool for migrating SQLite databases to CRDT-compatible schemas").version("1.0.0");
program.command("analyze").description("Analyze a database for CRDT compatibility").argument("<database>", "Path to the SQLite database file").option("--verbose", "Verbose output").action(async (database, options) => {
  try {
    logger.info(`Analyzing database: ${database}`);
    const analyzer = new DatabaseAnalyzer(database, {
      verbose: options.verbose
    });
    const analysis = await analyzer.analyze();
    logger.info("Analysis complete:");
    logger.info(JSON.stringify(analysis, null, 2));
    if (analysis.needsMigration) {
      logger.warn(`Database needs migration! Found ${analysis.issues.length} issues:`);
      analysis.issues.forEach((issue, index) => {
        logger.warn(`  ${index + 1}. ${issue.type}: ${issue.message}`);
        if (issue.details) {
          logger.warn(`     Details: ${issue.details}`);
        }
      });
    } else {
      logger.success("Database is CRDT compatible!");
    }
  } catch (error) {
    logger.error(`Analysis failed: ${error}`);
    process.exit(1);
  }
});
program.command("migrate").description("Migrate a database to CRDT-compatible schema").argument("<database>", "Path to the SQLite database file").option("--output", "Output directory for migration files", "./migration").option("--dry-run", "Perform a dry run without making changes").option("--verbose", "Verbose output").option("--backup", "Create a backup of the original database").action(async (database, options) => {
  try {
    logger.info(`Starting migration for: ${database}`);
    const migrator = new CRDTMigrator(database, {
      outputDir: options.output,
      dryRun: options.dryRun,
      verbose: options.verbose,
      backup: options.backup
    });
    const result = await migrator.migrate();
    logger.info("Migration complete:");
    logger.info(JSON.stringify(result, null, 2));
    if (result.success) {
      logger.success("Migration successful!");
    } else {
      logger.error("Migration failed!");
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Migration failed: ${error}`);
    process.exit(1);
  }
});
program.command("preview").description("Preview the migration changes without executing them").argument("<database>", "Path to the SQLite database file").option("--output", "Output directory for preview files", "./preview").option("--verbose", "Verbose output").action(async (database, options) => {
  try {
    logger.info(`Generating preview for: ${database}`);
    const migrator = new CRDTMigrator(database, {
      outputDir: options.output,
      dryRun: true,
      verbose: options.verbose,
      backup: false,
      preview: true
    });
    const preview = await migrator.preview();
    logger.info("Preview generated:");
    logger.info(JSON.stringify(preview, null, 2));
    logger.info("Migration SQL files:");
    preview.sqlFiles.forEach((file) => {
      logger.info(`  - ${file}`);
    });
  } catch (error) {
    logger.error(`Preview generation failed: ${error}`);
    process.exit(1);
  }
});
program.parse();
//# sourceMappingURL=index.js.map