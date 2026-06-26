import { clerkClient } from "@clerk/nextjs/server";

export class GitHubConnectionError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

export async function getGitHubToken(clerkUserId: string): Promise<string> {
  const client = await clerkClient();
  const response = await client.users.getUserOauthAccessToken(
    clerkUserId,
    "github"
  );
  const token = response.data[0]?.token;
  if (!token) {
    throw new GitHubConnectionError(
      "Connect GitHub to your Clerk account before importing repositories.",
      403
    );
  }
  return token;
}

export async function githubFetch<T>(
  token: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    const message =
      response.status === 404
        ? "Repository or branch not found."
        : body?.message || "GitHub request failed.";
    throw new GitHubConnectionError(message, response.status);
  }

  return (await response.json()) as T;
}
