export class Logger {
  private verbose: boolean = false;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  info(message: string): void {
    console.log(`\x1b[36mℹ\x1b[0m ${message}`);
  }

  success(message: string): void {
    console.log(`\x1b[32m✓\x1b[0m ${message}`);
  }

  warn(message: string): void {
    console.log(`\x1b[33m⚠\x1b[0m ${message}`);
  }

  error(message: string): void {
    console.log(`\x1b[31m✗\x1b[0m ${message}`);
  }

  debug(message: string): void {
    if (this.verbose) {
      console.log(`\x1b[35m🔍\x1b[0m ${message}`);
    }
  }

  table(data: any[]): void {
    if (this.verbose) {
      console.table(data);
    }
  }
}