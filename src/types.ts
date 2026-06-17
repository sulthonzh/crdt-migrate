export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  defaultValue: string | null;
  primaryKey: boolean;
  autoIncrement: boolean;
  unique?: boolean;
}

export interface ConstraintInfo {
  name: string;
  type: string;
  sql: string;
}

export interface ForeignKeyInfo {
  from: string;
  table: string;
  to: string;
  onDelete: string;
  onUpdate: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  foreignKeys: ForeignKeyInfo[];
  hasPrimaryKey: boolean;
  primaryKeyType: string | null;
  hasAutoIncrement: boolean;
  nullableColumns: string[];
  issues: Issue[];
}

export interface Issue {
  type: string;
  message: string;
  details?: string;
  table?: string;
  column?: string;
  foreignKeys?: Array<{
    table: string;
    column: string;
    references: string;
    columnRef: string;
    onDelete: string;
    onUpdate: string;
  }>;
}

export interface DatabaseAnalysis {
  databasePath: string;
  totalTables: number;
  needsMigration: boolean;
  issues: Issue[];
  tables: TableInfo[];
  summary: string;
}

export interface MigrationOptions {
  outputDir: string;
  databasePath: string;
  dryRun: boolean;
  verbose: boolean;
  backup: boolean;
  preview?: boolean;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  backupFile?: string;
  sqlFiles: string[];
  tablesMigrated: number;
  issuesResolved: number;
  warnings: string[];
}

export interface MigrationPreview {
  sqlFiles: string[];
  summary: {
    tablesToMigrate: number;
    primaryKeysToConvert: number;
    foreignKeysToUpdate: number;
    columnsToModify: number;
    estimatedTime: string;
  };
  warnings: string[];
}