import { randomUUID } from 'crypto';

export class UUIDGenerator {
  generate(): string {
    return randomUUID();
  }
}
