import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from './logger';
import { DatabaseAnalyzer } from './analyzer';
import { DatabaseAnalysis, MigrationOptions, MigrationResult, MigrationPreview } from './types';

export class CRDTMigrator {
  private db: sqlite3.Database;
  private logger: Logger;
  private options: MigrationOptions;
  private analyzer: DatabaseAnalyzer;

  constructor(databasePath: string, options: MigrationOptions) {
    this.db = new sqlite3.Database(databasePath);
    this.logger = new Logger(options.verbose);
    this.options = { ...options, databasePath };
    this.analyzer = new DatabaseAnalyzer(
      databasePath,
      { verbose: options.verbose }
    );
  }

  async close(): Promise<void> {
    await promisify(this.db.close.bind(this.db))();
  }

  async migrate(): Promise<MigrationResult> {
    this.logger.info('Starting CRDT migration...');

    try {
      // Analyze the database
      const analysis = await this.analyzer.analyze();

      // Early return if no migration needed
      if (!analysis.needsMigration) {
        this.logger.info('Database is already CRDT compatible');
        return {
          success: true,
          message: 'Database is already CRDT compatible',
          backupFile: undefined,
          sqlFiles: [],
          tablesMigrated: 0,
          issuesResolved: 0,
          warnings: this.generateWarnings(analysis)
        };
      }

      // Generate backup if requested
      let backupFile: string | undefined;
      if (this.options.backup) {
        backupFile = await this.createBackup();
        this.logger.info(`Backup created: ${backupFile}`);
      }

      // Generate migration SQL
      const sqlFiles = await this.generateMigrationSQL(analysis);
      this.logger.info(`Generated ${sqlFiles.length} SQL files`);

      if (this.options.dryRun || this.options.preview) {
        this.logger.info('Dry run completed - no changes made to database');
        return {
          success: true,
          message: 'Dry run completed successfully',
          backupFile: backupFile || undefined,
          sqlFiles: this.options.dryRun ? [] : sqlFiles,
          tablesMigrated: analysis.tables.length,
          issuesResolved: analysis.issues.length,
          warnings: this.generateWarnings(analysis)
        };
      }

      // Execute migration
      await this.executeMigration(sqlFiles, analysis);

      this.logger.info('Migration completed successfully');
      return {
        success: true,
        message: 'Migration completed successfully',
        backupFile: backupFile || undefined,
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

  async preview(): Promise<MigrationPreview> {
    this.logger.info('Generating migration preview...');

    try {
      const analysis = await this.analyzer.analyze();
      const sqlFiles = await this.generateMigrationSQL(analysis);

      const tablesToMigrate = analysis.tables.filter(t =>
        t.hasAutoIncrement ||
        (t.hasPrimaryKey && t.primaryKeyType?.toLowerCase() !== 'text')
      ).length;

      const primaryKeysToConvert = analysis.tables.filter(t =>
        t.hasPrimaryKey && t.primaryKeyType?.toLowerCase() !== 'text'
      ).length;

      const foreignKeysToUpdate = analysis.tables.reduce(
        (sum, t) => sum + t.foreignKeys.length, 0
      );

      const columnsToModify = analysis.tables.reduce(
        (sum, t) => sum + t.nullableColumns.length, 0
      );

      return {
        sqlFiles: sqlFiles,
        summary: {
          tablesToMigrate,
          primaryKeysToConvert,
          foreignKeysToUpdate,
          columnsToModify,
          estimatedTime: this.estimateMigrationTime(analysis)
        },
        warnings: this.generateWarnings(analysis)
      };

    } catch (error) {
      throw new Error(`Preview generation failed: ${error}`);
    }
  }

  private async createBackup(): Promise<string> {
    const backupPath = path.join(
      this.options.outputDir,
      `backup-${Date.now()}.db`
    );
    
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    const dbPath = this.options.backupFile || this.options.databasePath || path.join(this.options.outputDir, 'test-database.db');
    await fs.copyFile(dbPath, backupPath);
    
    return backupPath;
  }

  private async generateMigrationSQL(analysis: DatabaseAnalysis): Promise<string[]> {
    this.logger.info('Generating migration SQL files...');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = this.options.outputDir;
    await fs.mkdir(outputDir, { recursive: true });

    const sqlFiles: string[] = [];

    // First, generate data migration scripts (run BEFORE schema changes)
    let dataSQL = `-- CRDT Data Migration Script (run BEFORE migration.sql)
-- Generated: ${timestamp}

-- Enable foreign key constraints
PRAGMA foreign_keys = OFF;

-- Disable triggers during migration
PRAGMA recursive_triggers = OFF;

`;

    // Create data conversion scripts for each table
    analysis.tables.forEach(table => {
      if (table.hasPrimaryKey && table.primaryKeyType?.toLowerCase() !== 'text') {
        const pkColumn = table.columns.find(col => col.primaryKey);
        if (!pkColumn) return;
        
        // Build column list for INSERT (exclude old PK)
        const columns = table.columns.filter(c => !c.primaryKey).map(col => {
          // Check if this is a FK column that references a converted PK
          const fk = table.foreignKeys.find(f => f.from === col.name);
          if (fk) {
            const refTable = analysis.tables.find(t => t.name === fk.table);
            if (refTable && refTable.primaryKeyType?.toLowerCase() !== 'text') {
              return `${col.name} TEXT`; // FK column also needs to be TEXT
            }
          }
          return col.name;
        });
        
        const selectColumns = table.columns.filter(c => !c.primaryKey).map(c => c.name).join(', ');
        
        if (columns.length === 0) {
          // Table only has PK column, just generate UUIDs
          dataSQL += `-- Create temporary table with UUIDs for ${table.name}\n`;
          dataSQL += `DROP TABLE IF EXISTS ${table.name}_new;\n`;
          dataSQL += `CREATE TABLE ${table.name}_new (\n`;
          dataSQL += `  id TEXT PRIMARY KEY\n`;
          dataSQL += `);\n`;
          dataSQL += `INSERT INTO ${table.name}_new (id)\n`;
          dataSQL += `SELECT lower(hex(randomblob(16))) AS id\n`;
          dataSQL += `FROM ${table.name};\n\n`;
        } else {
          // Table has other columns, copy them
          const colDefs = columns.join(',\n  ');
          dataSQL += `-- Create temporary table with UUIDs for ${table.name}\n`;
          dataSQL += `DROP TABLE IF EXISTS ${table.name}_new;\n`;
          dataSQL += `CREATE TABLE ${table.name}_new (\n`;
          dataSQL += `  id TEXT,\n  ${colDefs}\n`;
          dataSQL += `);\n`;
          dataSQL += `INSERT INTO ${table.name}_new (id, ${selectColumns})\n`;
          dataSQL += `SELECT lower(hex(randomblob(16))) AS id, ${selectColumns}\n`;
          dataSQL += `FROM ${table.name};\n\n`;
        }
      }
    });

    // Generate main migration SQL
    let mainSQL = `-- CRDT Migration SQL (run AFTER data-migration.sql)
-- Generated: ${timestamp}
-- Database: ${analysis.databasePath || 'unknown.db'}
-- Total tables: ${analysis.totalTables}
-- Issues found: ${analysis.issues.length}

-- Enable foreign key constraints for better data integrity
PRAGMA foreign_keys = ON;

-- Enable recursive triggers for cascading updates
PRAGMA recursive_triggers = ON;

`;

    // Add table creation scripts for CRDT-compatible schemas
    analysis.tables.forEach(table => {
      const pkColumn = table.columns.find(col => col.primaryKey);
      const hasUUIDPK = table.hasPrimaryKey && table.primaryKeyType?.toLowerCase() === 'text';
      
      mainSQL += `-- Table: ${table.name}\n`;
      mainSQL += `DROP TABLE IF EXISTS ${table.name};\n`;
      mainSQL += `CREATE TABLE ${table.name} (\n`;
      
      // Always use 'id' as TEXT PK for CRDT compatibility
      mainSQL += `  id TEXT PRIMARY KEY`;
      
      // Add other columns (skip old PK column)
      table.columns.forEach(col => {
        if (col.primaryKey) return; // Skip the old PK column
        
        // FK columns should be TEXT in CRDT schemas
        const isFK = table.foreignKeys.some(fk => fk.from === col.name);
        
        let colDef = `,\n  ${col.name} ${isFK ? 'TEXT' : col.type}`;
        
        // Add NOT NULL constraint
        if (col.notNull && col.name !== 'id') {
          colDef += ' NOT NULL';
        }
        
        // Add DEFAULT values for nullable columns
        if (!col.notNull && col.name !== 'id' && col.type.toLowerCase() === 'text') {
          colDef += ' DEFAULT ""';
        } else if (!col.notNull && col.name !== 'id' && col.type.toLowerCase() === 'integer') {
          colDef += ' DEFAULT 0';
        }
        
        // Add UNIQUE constraint if needed
        if (col.unique && col.name !== 'id') {
          colDef += ' UNIQUE';
        }
        
        mainSQL += colDef;
      });
      
      // Add foreign key constraints (update references to new 'id' PK)
      table.foreignKeys.forEach(fk => {
        // If FK references a table that had its PK converted, reference 'id'
        const refTable = analysis.tables.find(t => t.name === fk.table);
        const refPK = refTable?.columns.find(c => c.primaryKey)?.name;
        const targetCol = (refPK && refPK !== 'id') ? 'id' : fk.to;
        const fromCol = fk.from;
        mainSQL += `,\n  FOREIGN KEY (${fromCol}) REFERENCES ${fk.table}(${targetCol})`;
        if (fk.onDelete) mainSQL += ` ON DELETE ${fk.onDelete}`;
        if (fk.onUpdate) mainSQL += ` ON UPDATE ${fk.onUpdate}`;
      });
      
      mainSQL += '\n);\n\n';
    });

    // Replace old tables with new CRDT-compatible tables
    analysis.tables.forEach(table => {
      if (table.hasPrimaryKey && table.primaryKeyType?.toLowerCase() !== 'text') {
        mainSQL += `-- Replace ${table.name} with CRDT-compatible version\n`;
        mainSQL += `DROP TABLE IF EXISTS ${table.name};\n`;
        mainSQL += `ALTER TABLE ${table.name}_new RENAME TO ${table.name};\n\n`;
      }
    });

    // Write SQL files
    const mainSQLFile = path.join(outputDir, `migration-${timestamp}.sql`);
    const dataSQLFile = path.join(outputDir, `data-migration-${timestamp}.sql`);
    
    await fs.writeFile(mainSQLFile, mainSQL);
    await fs.writeFile(dataSQLFile, dataSQL);
    
    sqlFiles.push(mainSQLFile, dataSQLFile);
    
    return sqlFiles;
  }

  private async executeMigration(sqlFiles: string[], analysis: DatabaseAnalysis): Promise<void> {
    this.logger.info('Executing migration...');

    // Read and execute the data migration SQL FIRST (before schema changes)
    const dataSQLFile = sqlFiles.find(f => f.includes('data-migration-'));
    const needsUUIDConversion = analysis.tables.some(t => t.hasPrimaryKey && t.primaryKeyType?.toLowerCase() !== 'text');
    
    if (dataSQLFile && needsUUIDConversion) {
      const sql = await fs.readFile(dataSQLFile, 'utf-8');
      await this.executeSQL(sql);
      this.logger.info(`Executed data migration: ${path.basename(dataSQLFile)}`);
    }

    // Read and execute the main migration SQL (schema changes)
    const mainSQLFile = sqlFiles.find(f => f.includes('migration-') && !f.includes('data-'));
    if (mainSQLFile) {
      const sql = await fs.readFile(mainSQLFile, 'utf-8');
      await this.executeSQL(sql);
      this.logger.info(`Executed main migration: ${path.basename(mainSQLFile)}`);
    }

    this.logger.info('Migration executed successfully');
  }

  private async executeSQL(sql: string): Promise<void> {
    await promisify(this.db.exec.bind(this.db))(sql);
  }

  private generateWarnings(analysis: DatabaseAnalysis): string[] {
    const warnings: string[] = [];
    
    if (analysis.issues.length === 0) {
      warnings.push('Database is already CRDT compatible');
    }
    
    if (analysis.tables.length > 10) {
      warnings.push(`Large database with ${analysis.tables.length} tables may take longer to migrate`);
    }
    
    const totalFKs = analysis.tables.reduce((sum, t) => sum + t.foreignKeys.length, 0);
    if (totalFKs > 0) {
      warnings.push(`Database has ${totalFKs} foreign key constraints that will need manual review after migration`);
    }
    
    analysis.tables.forEach(table => {
      if (table.foreignKeys.length > 5) {
        warnings.push(`Table ${table.name} has many foreign key constraints - migration may be complex`);
      }
    });
    
    return warnings;
  }

  private estimateMigrationTime(_analysis: DatabaseAnalysis): string {
    return '1-2 minutes';
  }
}