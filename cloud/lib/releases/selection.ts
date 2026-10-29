import { compare, semver } from "../../../desktop/scripts/updates/protocol.js";
export function latestStable<
  T extends { version: string; status: string; stable: boolean },
>(rows: T[]) {
  return (
    rows
      .filter(
        (x) =>
          x.status === "PUBLISHED" &&
          x.stable &&
          semver(x.version)?.pre.length === 0,
      )
      .sort((a, b) => compare(b.version, a.version))[0] || null
  );
}
