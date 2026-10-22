export type Role = "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
export type LoginResult = {
  credential: string;
  expiresAt: string;
};
