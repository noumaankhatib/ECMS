export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

export interface LoginResult {
  readonly user: AuthenticatedUser;
  readonly token: string;
  readonly expiresAt: Date;
}
