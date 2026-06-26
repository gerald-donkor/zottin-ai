import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/prisma";
import { getGitHubToken, githubFetch, GitHubConnectionError } from "@/lib/github";
import type { FileData, Message } from "@/types/workspace";
import type { GitHubImportRequest } from "@/types/github";

interface GitTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

interface GitTreeResponse {
  tree: GitTreeItem[];
  truncated: boolean;
}

interface GitBlobResponse {
  content: string;
  encoding: string;
}

const ALLOWED_SOURCE_FILE = /\.(js|jsx|css|json|svg)$/i;
const MAX_FILES = 80;
const MAX_FILE_SIZE = 300_000;

function safeSegment(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9._-]+$/.test(value) &&
    value.length <= 100
  );
}

function safeBranch(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.includes("..") &&
    value.length <= 200
  );
}

function decodeBlob(blob: GitBlobResponse): string {
  if (blob.encoding !== "base64") {
    throw new GitHubConnectionError("GitHub returned an unsupported file encoding.");
  }
  return Buffer.from(blob.content.replace(/\n/g, ""), "base64").toString("utf8");
}

export async function POST(request: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as Partial<GitHubImportRequest>;
    if (
      !safeSegment(body.owner) ||
      !safeSegment(body.repo) ||
      !safeBranch(body.branch)
    ) {
      return Response.json({ message: "Invalid repository." }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      select: { id: true },
    });
    if (!user) {
      return Response.json({ message: "User not found." }, { status: 404 });
    }

    const token = await getGitHubToken(clerkId);
    const encodedBranch = encodeURIComponent(body.branch);
    const tree = await githubFetch<GitTreeResponse>(
      token,
      `/repos/${body.owner}/${body.repo}/git/trees/${encodedBranch}?recursive=1`
    );
    if (tree.truncated) {
      throw new GitHubConnectionError(
        "This repository is too large to import directly."
      );
    }

    const packageItem = tree.tree.find(
      (item) => item.type === "blob" && item.path === "package.json"
    );
    const sourceItems = tree.tree.filter(
      (item) =>
        item.type === "blob" &&
        item.path.startsWith("src/") &&
        ALLOWED_SOURCE_FILE.test(item.path) &&
        (item.size ?? 0) <= MAX_FILE_SIZE
    );
    const appItem = sourceItems.find((item) =>
      /^src\/App\.(js|jsx)$/i.test(item.path)
    );

    if (!packageItem || !appItem) {
      throw new GitHubConnectionError(
        "Zottin currently imports React JavaScript repositories with package.json and src/App.js or src/App.jsx."
      );
    }
    if (sourceItems.length > MAX_FILES) {
      throw new GitHubConnectionError(
        `This repository has more than ${MAX_FILES} supported source files.`
      );
    }

    const items = [packageItem, ...sourceItems];
    const contents = await Promise.all(
      items.map(async (item) => {
        const blob = await githubFetch<GitBlobResponse>(
          token,
          `/repos/${body.owner}/${body.repo}/git/blobs/${item.sha}`
        );
        return [item.path, decodeBlob(blob)] as const;
      })
    );
    const contentMap = new Map(contents);
    const packageJson = JSON.parse(contentMap.get("package.json") ?? "{}") as {
      dependencies?: Record<string, string>;
    };

    const files: FileData["files"] = {};
    for (const item of sourceItems) {
      const sourcePath = item.path.slice(4);
      const targetPath =
        item.sha === appItem.sha ? "/App.js" : `/${sourcePath}`;
      files[targetPath] = { code: contentMap.get(item.path) ?? "" };
    }
    const dependencies = Object.fromEntries(
      Object.entries(packageJson.dependencies ?? {}).filter(
        ([name]) => !["react", "react-dom", "tailwindcss"].includes(name)
      )
    );
    const title = body.repo.replace(/[-_]+/g, " ");
    const fileData: FileData = {
      files,
      dependencies,
      title,
      framework: "react",
    };
    const messages: Message[] = [
      {
        role: "assistant",
        content: `Imported ${body.owner}/${body.repo} from GitHub (${body.branch}).`,
      },
    ];
    const versionId = crypto.randomUUID();

    const workspace = await db.workspace.create({
      data: {
        userId: user.id,
        title,
        messages: messages as never,
        fileData: fileData as never,
        githubOwner: body.owner,
        githubRepo: body.repo,
        githubBranch: body.branch,
        versions: {
          create: {
            id: versionId,
            fileData: fileData as never,
            source: "import",
            summary: `Imported from ${body.owner}/${body.repo}`,
          },
        },
      },
      select: { id: true },
    });

    return Response.json({ workspaceId: workspace.id });
  } catch (error) {
    const status = error instanceof GitHubConnectionError ? error.status : 500;
    return Response.json(
      {
        message:
          error instanceof Error ? error.message : "Could not import repository.",
      },
      { status }
    );
  }
}
