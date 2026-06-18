import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs/promises';
import { Logger } from './logger';
import { DatabaseAnalysis, Issue, TableInfo, ColumnInfo } from './types';

export interface AnalyzerOptions {
  verbose: boolean;
}

export class DatabaseAnalyzer {
  private db: sqlite3.Database;
  private logger: Logger;
  private options: AnalyzerOptions;
  private databasePath: string;

  constructor(databasePath: string, options: AnalyzerOptions = { verbose: false }) {
    this.databasePath = databasePath;
    this.db = new sqlite3.Database(databasePath);
    this.logger = new Logger(options.verbose);
    this.options = options;
  }

  async analyze(): Promise<DatabaseAnalysis> {
    this.logger.info('Starting database analysis...');

    try {
      // Verify the database file exists
      try {
        await fs.access(this.databasePath);
      } catch {
        throw new Error(`Database file not found: ${this.databasePath}`);
      }
      const tables = await this.getTables();
      const issues: Issue[] = [];
      const tableInfos: TableInfo[] = [];

      for (const table of tables) {
        const tableInfo = await this.analyzeTable(table);
        tableInfos.push(tableInfo);
        issues.push(...tableInfo.issues);
      }

      const needsMigration = issues.length > 0;

      const analysis: DatabaseAnalysis = {
        databasePath: this.databasePath,
        totalTables: tables.length,
        needsMigration,
        issues,
        tables: tableInfos,
        summary: this.generateSummary(issues, needsMigration)
      };

      this.logger.info('Analysis complete');
      this.logger.table(tableInfos.map(t => ({
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

  private async getTables(): Promise<string[]> {
    const sql = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'";
    const rows = await this.all(sql);
    return rows.map(row => row.name as string);
  }

  private async analyzeTable(tableName: string): Promise<TableInfo> {
    this.logger.debug(`Analyzing table: ${tableName}`);

    const [columns, constraints, foreignKeys] = await Promise.all([
      this.getTableColumns(tableName),
      this.getTableConstraints(tableName),
      this.getTableForeignKeys(tableName)
    ]);

    const primaryKey = columns.find(col => col.primaryKey);
    const hasAutoIncrement = !!primaryKey?.autoIncrement;
    const hasPrimaryKey = !!primaryKey;

    const issues: Issue[] = [];

    // Check for auto-increment primary keys
    if (hasAutoIncrement) {
      issues.push({
        type: 'AUTO_INCREMENT_PRIMARY_KEY',
        message: `Table "${tableName}" has auto-increment primary key`,
        details: 'CRDT databases require UUID primary keys instead of auto-incrementing integers',
        table: tableName,
        column: primaryKey?.name
      });
    }

    // Check for non-TEXT primary keys
    if (hasPrimaryKey && primaryKey?.type.toLowerCase() !== 'text') {
      issues.push({
        type: 'NON_TEXT_PRIMARY_KEY',
        message: `Table "${tableName}" has non-TEXT primary key`,
        details: `Primary key type is "${primaryKey.type}", CRDT requires TEXT`,
        table: tableName,
        column: primaryKey?.name
      });
    }

    // Check for nullable columns without default values
    const nullableWithoutDefault = columns.filter(col => 
      !col.notNull && !col.defaultValue && col.name !== primaryKey?.name
    );

    if (nullableWithoutDefault.length > 0) {
      issues.push({
        type: 'NULLABLE_WITHOUT_DEFAULT',
        message: `Table "${tableName}" has nullable columns without default values`,
        details: nullableWithoutDefault.map(col => col.name).join(', '),
        table: tableName
      });
    }

    // Check foreign key references
    const foreignKeyIssues = foreignKeys.map(fk => ({
      table: tableName,
      column: fk.from,
      references: fk.table,
      columnRef: fk.to,
      onDelete: fk.onDelete,
      onUpdate: fk.onUpdate
    }));

    if (foreignKeyIssues.length > 0) {
      issues.push({
        type: 'FOREIGN_KEY_CONSTRAINTS',
        message: `Table "${tableName}" has foreign key constraints`,
        details: `Foreign keys may need to be updated for UUID references: ${foreignKeyIssues.map(fk => `${fk.column} → ${fk.table}.${fk.columnRef}`).join(', ')}`,
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
      nullableColumns: nullableWithoutDefault.map(col => col.name),
      issues
    };
  }

  private async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const sql = `PRAGMA table_info(${tableName})`;
    const rows = await this.all(sql);
    
    return rows.map(row => ({
      name: row.name as string,
      type: row.type as string,
      notNull: !!row.notnull,
      defaultValue: row.dflt_value,
      primaryKey: !!row.pk,
      autoIncrement: row.pk && row.type.toLowerCase().includes('integer') ? true : false
    }));
  }

  private async getTableConstraints(tableName: string): Promise<any[]> {
    const sql = `PRAGMA index_list(${tableName})`;
    const rows = await this.all(sql);
    return rows;
  }

  private async getTableForeignKeys(tableName: string): Promise<any[]> {
    const sql = `PRAGMA foreign_key_list(${tableName})`;
    const rows = await this.all(sql);
    return rows.map(row => ({
      from: row.from as string,
      table: row.table as string,
      to: row.to as string,
      onDelete: row.on_delete as string,
      onUpdate: row.on_update as string
    }));
  }

  private generateSummary(issues: Issue[], needsMigration: boolean): string {
    if (!needsMigration) {
      return 'Database schema is CRDT-compatible';
    }

    const byType = issues.reduce((acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return `Migration required. Issues: ${Object.entries(byType).map(([type, count]) => `${count} ${type}`).join(', ')}`;
  }

  private all(sql: string): Promise<any[]> {
    return promisify(this.db.all).bind(this.db)(sql);
  }

  private close(): Promise<void> {
    return promisify(this.db.close).bind(this.db)();
  }
}