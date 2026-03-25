/**
 * Shared Resend mock.
 *
 * Usage — mock the whole `resend` package:
 *
 *   vi.mock("resend", () => import("../tests/__mocks__/resend"));
 *
 * Or mock only the service that wraps Resend:
 *
 *   vi.mock("@/server/services/user-service", async (importOriginal) => {
 *     const actual = await importOriginal<typeof import("@/server/services/user-service")>();
 *     return { ...actual, sendWelcomeEmail: mockSendWelcomeEmail };
 *   });
 */
import { vi } from "vitest";

/** Spy on individual email sends. */
export const mockEmailSend = vi.fn().mockResolvedValue({ id: "mock-email-id" });

/** The mock Resend class — mirrors `new Resend(apiKey)` usage. */
export const Resend = vi.fn().mockImplementation(() => ({
  emails: {
    send: mockEmailSend,
  },
}));

/** Reset helper — call in beforeEach. */
export function resetResendMocks() {
  mockEmailSend.mockReset().mockResolvedValue({ id: "mock-email-id" });
  Resend.mockClear();
}
