import { auth } from "@clerk/nextjs/server";
import { getGitHubToken, githubFetch, GitHubConnectionError } from "@/lib/github";
import type { GitHubRepository } from "@/types/github";

interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  description: string | null;
  private: boolean;
  default_branch: string;
  updated_at: string;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = await getGitHubToken(userId);
    const repositories = await githubFetch<GitHubRepoResponse[]>(
      token,
      "/user/repos?sort=updated&direction=desc&per_page=100&affiliation=owner,collaborator,organization_member"
    );
    const data: GitHubRepository[] = repositories.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      description: repo.description,
      private: repo.private,
      defaultBranch: repo.default_branch,
      updatedAt: repo.updated_at,
    }));
    return Response.json({ repositories: data });
  } catch (error) {
    const status = error instanceof GitHubConnectionError ? error.status : 500;
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "Could not load repositories.",
      },
      { status }
    );
  }
}
