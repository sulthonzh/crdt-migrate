#!/usr/bin/env node

import { Command } from 'commander';
import { CRDTMigrator } from './migrator';
import { DatabaseAnalyzer } from './analyzer';
import { Logger } from './logger';

const program = new Command();
const logger = new Logger();

program
  .name('crdt-migrate')
  .description('CLI tool for migrating SQLite databases to CRDT-compatible schemas')
  .version('1.0.0');

program
  .command('analyze')
  .description('Analyze a database for CRDT compatibility')
  .argument('<database>', 'Path to the SQLite database file')
  .option('--verbose', 'Verbose output')
  .action(async (database, options) => {
    try {
      logger.info(`Analyzing database: ${database}`);
      
      const analyzer = new DatabaseAnalyzer(database, {
        verbose: options.verbose
      });
      
      const analysis = await analyzer.analyze();
      
      logger.info('Analysis complete:');
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
        logger.success('Database is CRDT compatible!');
      }
    } catch (error) {
      logger.error(`Analysis failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('migrate')
  .description('Migrate a database to CRDT-compatible schema')
  .argument('<database>', 'Path to the SQLite database file')
  .option('--output', 'Output directory for migration files', './migration')
  .option('--dry-run', 'Perform a dry run without making changes')
  .option('--verbose', 'Verbose output')
  .option('--backup', 'Create a backup of the original database')
  .action(async (database, options) => {
    try {
      logger.info(`Starting migration for: ${database}`);
      
      const migrator = new CRDTMigrator(database, {
        outputDir: options.output,
        dryRun: options.dryRun,
        verbose: options.verbose,
        backup: options.backup
      });
      
      const result = await migrator.migrate();
      
      logger.info('Migration complete:');
      logger.info(JSON.stringify(result, null, 2));
      
      if (result.success) {
        logger.success('Migration successful!');
      } else {
        logger.error('Migration failed!');
        process.exit(1);
      }
    } catch (error) {
      logger.error(`Migration failed: ${error}`);
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Preview the migration changes without executing them')
  .argument('<database>', 'Path to the SQLite database file')
  .option('--output', 'Output directory for preview files', './preview')
  .option('--verbose', 'Verbose output')
  .action(async (database, options) => {
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
      
      logger.info('Preview generated:');
      logger.info(JSON.stringify(preview, null, 2));
      
      logger.info('Migration SQL files:');
      preview.sqlFiles.forEach(file => {
        logger.info(`  - ${file}`);
      });
    } catch (error) {
      logger.error(`Preview generation failed: ${error}`);
      process.exit(1);
    }
  });

program.parse();