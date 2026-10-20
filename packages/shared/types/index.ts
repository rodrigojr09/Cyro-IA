export type Role = "SUPER_ADMIN" | "ADMIN" | "EMPLOYEE";
export type ActivationResult = {
  credential: string;
  expiresAt: string;
  user: { id: string; name: string };
};
