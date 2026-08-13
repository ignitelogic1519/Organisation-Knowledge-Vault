import { z } from "zod";

// Auth contracts — username-based identity (owner decision 2026-07-19; the email system was
// removed from v1 — docs/future.md §10).

export const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(40, "Username is too long")
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._@-]*[a-zA-Z0-9])?$/,
    "Usernames may contain letters, numbers, dots, dashes, underscores and @",
  );

export const registerSchema = z.object({
  username: usernameSchema,
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password is too long"),
  displayName: z.string().min(1, "Enter your name").max(80),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: z.string().min(1, "Enter your username"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  createdAt: string;
}

export const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  /** Small data-URL image (validated & size-capped server-side), or null to clear. */
  avatar: z.string().max(400_000).nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export interface AuthTokens {
  /** Short-lived JWT sent as `Authorization: Bearer <token>`. */
  accessToken: string;
  /** Opaque rotating token — exchange at POST /auth/refresh. */
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  /**
   * Inactivity that ends the session, in seconds (structure.md §8.8). The API owns this
   * number — the client counts down with it rather than hard-coding an hour of its own,
   * so changing the policy on the server changes it everywhere.
   */
  idleTimeoutSeconds: number;
}

export interface AuthResponse {
  profile: PublicProfile;
  tokens: AuthTokens;
}

/**
 * Why the API refused a token. Sent as `code` beside the 401's `error` message so the
 * client can tell "you were away too long" apart from "something went wrong" — the
 * difference between an explanation and a mystery on the sign-in page.
 */
export const SESSION_ENDED = {
  /** No request and no sign of the user for longer than the idle window. */
  idle: "session_idle",
  /** Absolute lifetime reached, or the session was ended elsewhere (logout, ban). */
  ended: "session_ended",
} as const;
export type SessionEndedCode = (typeof SESSION_ENDED)[keyof typeof SESSION_ENDED];

export function isSessionEndedCode(value: unknown): value is SessionEndedCode {
  return value === SESSION_ENDED.idle || value === SESSION_ENDED.ended;
}

/** Reply to POST /auth/activity — the "the user is still here" beat. */
export interface SessionActivityResponse {
  ok: boolean;
  /** Inactivity that ends the session, in seconds. */
  idleTimeoutSeconds: number;
  /** When this session dies if nothing else happens (ISO 8601). */
  idleDeadline: string;
}
