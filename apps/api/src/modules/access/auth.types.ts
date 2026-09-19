export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
  readonly email: string | null;
  readonly displayName: string;
}

export interface LoginResult {
  readonly user: AuthenticatedUser;
  readonly token: string;
  readonly expiresAt: Date;
}
