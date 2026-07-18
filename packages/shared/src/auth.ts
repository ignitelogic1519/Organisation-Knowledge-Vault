import { z } from "zod";

// Auth request/response contracts — one source of truth for web forms and API validation.

export const registerSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(200, "Password is too long"),
  displayName: z.string().min(1, "Enter your name").max(80),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleAuthSchema = z.object({
  /** Google Identity Services ID token (JWT credential from the sign-in button). */
  idToken: z.string().min(10),
});
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(10),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export interface PublicProfile {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
  hasPassword: boolean;
  googleLinked: boolean;
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
