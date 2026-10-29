import { unstable_cache, revalidateTag } from "next/cache";
import { githubClient } from "./github";
export const cachedTags = unstable_cache(
  () => githubClient().tags(),
  ["cyro-github-tags-v1"],
  { revalidate: 300, tags: ["cyro-github-tags"] },
);
export function refreshTags() {
  revalidateTag("cyro-github-tags", { expire: 0 });
}
