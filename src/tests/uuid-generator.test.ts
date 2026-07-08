import { describe, it, expect } from 'vitest';
import { UUIDGenerator } from '../uuid-generator';

describe('UUIDGenerator', () => {
  const generator = new UUIDGenerator();

  it('should generate a valid UUID v4 string', () => {
    const uuid = generator.generate();
    expect(typeof uuid).toBe('string');
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('should generate unique UUIDs', () => {
    const uuids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      uuids.add(generator.generate());
    }
    expect(uuids.size).toBe(1000);
  });

  it('should have version 4 indicator', () => {
    const uuid = generator.generate();
    expect(uuid[14]).toBe('4');
  });

  it('should have valid variant bits (8, 9, a, or b)', () => {
    const uuid = generator.generate();
    expect(['8', '9', 'a', 'b']).toContain(uuid[19]);
  });

  it('should be 36 characters long including hyphens', () => {
    const uuid = generator.generate();
    expect(uuid.length).toBe(36);
  });
});
