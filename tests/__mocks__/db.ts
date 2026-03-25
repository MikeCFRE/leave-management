/**
 * Shared Drizzle ORM mock helpers.
 *
 * Usage in a test file:
 *
 *   vi.mock("@/server/db", () => import("../tests/__mocks__/db"));
 *
 * Then reset between tests:
 *
 *   beforeEach(() => resetDbMocks());
 */
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Chainable query-builder stubs
// ---------------------------------------------------------------------------

/** db.update(table).set(values).where(condition) */
export const mockDbWhere = vi.fn().mockResolvedValue(undefined);
export const mockDbSet = vi.fn().mockReturnValue({ where: mockDbWhere });
export const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbSet });

/** db.insert(table).values(rows) */
export const mockDbValues = vi.fn().mockResolvedValue(undefined);
export const mockDbInsert = vi.fn().mockReturnValue({ values: mockDbValues });

/** db.query.<table>.findFirst(opts) */
export const mockDbFindFirst = vi.fn();

/** db.query.<table>.findMany(opts) */
export const mockDbFindMany = vi.fn();

// ---------------------------------------------------------------------------
// The mock db export (mirrors the shape imported as `db` in production code)
// ---------------------------------------------------------------------------

export const db = {
  update: mockDbUpdate,
  insert: mockDbInsert,
  query: {
    users: {
      findFirst: mockDbFindFirst,
      findMany: mockDbFindMany,
    },
  },
};

// ---------------------------------------------------------------------------
// Reset helper — call in beforeEach
// ---------------------------------------------------------------------------

export function resetDbMocks() {
  mockDbWhere.mockReset().mockResolvedValue(undefined);
  mockDbSet.mockReset().mockReturnValue({ where: mockDbWhere });
  mockDbUpdate.mockReset().mockReturnValue({ set: mockDbSet });
  mockDbValues.mockReset().mockResolvedValue(undefined);
  mockDbInsert.mockReset().mockReturnValue({ values: mockDbValues });
  mockDbFindFirst.mockReset();
  mockDbFindMany.mockReset();
}
