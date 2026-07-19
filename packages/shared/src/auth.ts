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
  createdAt: string;
}

export interface AuthTokens {
  /** Short-lived JWT sent as `Authorization: Bearer <token>`. */
  accessToken: string;
  /** Opaque rotating token — exchange at POST /auth/refresh. */
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

export interface AuthResponse {
  profile: PublicProfile;
  tokens: AuthTokens;
}
