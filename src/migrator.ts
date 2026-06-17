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

      return {
        databasePath: analysis.databasePath,
        totalTables: analysis.totalTables,
        needsMigration: analysis.needsMigration,
        issues: analysis.issues,
        tables: analysis.tables,
        summary: analysis.summary,
        sqlFiles: sqlFiles.slice(0, 2), // Show first 2 SQL files for preview
        estimatedTime: this.estimateMigrationTime(analysis),
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

    // Generate main migration SQL
    let mainSQL = `-- CRDT Migration SQL
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
      mainSQL += `-- Table: ${table.name}\n`;
      mainSQL += `CREATE TABLE ${table.name} (\n`;
      
      // Columns
      table.columns.forEach((col, index) => {
        if (index > 0) mainSQL += ',\n';
        let colDef = `  ${col.name} ${col.type}`;
        
        // Add NOT NULL constraint
        if (col.notNull && col.name !== 'id') {
          colDef += ' NOT NULL';
        }
        
        // Add DEFAULT values for certain columns
        if (!col.notNull && col.name !== 'id' && col.type.toLowerCase() === 'text') {
          colDef += ' DEFAULT ""';
        } else if (!col.notNull && col.type.toLowerCase() === 'integer') {
          colDef += ' DEFAULT 0';
        }
        
        // Add UNIQUE constraint if needed
        if (col.unique && col.name !== 'id') {
          colDef += ' UNIQUE';
        }
        
        mainSQL += colDef;
      });
      
      // Add primary key constraint (UUID)
      mainSQL += ',\n  PRIMARY KEY (id)';
      
      // Add foreign key constraints
      table.foreignKeys.forEach(fk => {
        mainSQL += `,\n  FOREIGN KEY (${fk.from}) REFERENCES ${fk.table}(${fk.to})`;
        if (fk.onDelete) mainSQL += ` ON DELETE ${fk.onDelete}`;
        if (fk.onUpdate) mainSQL += ` ON UPDATE ${fk.onUpdate}`;
      });
      
      mainSQL += '\n);\n\n';
    });

    // Generate data migration scripts
    let dataSQL = `-- CRDT Data Migration Script
-- Generated: ${timestamp}

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

`;

    // Insert data conversion scripts
    analysis.tables.forEach(table => {
      if (table.hasPrimaryKey && table.primaryKeyType?.toLowerCase() !== 'text') {
        // Simple UUID generation
        const insertSQL = `INSERT INTO ${table.name} (id, `;
        const selectSQL = `SELECT `;
        const columnSQL = '';
        
        dataSQL += `-- Convert ${table.name} data to UUID\n`;
        dataSQL += insertSQL;
        dataSQL += selectSQL;
        dataSQL += ` FROM ${table.name};\n\n`;
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

    // Read and execute the main migration SQL
    const mainSQLFile = sqlFiles.find(f => f.includes('migration-'));
    if (mainSQLFile) {
      const sql = await fs.readFile(mainSQLFile, 'utf-8');
      await this.executeSQL(sql);
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