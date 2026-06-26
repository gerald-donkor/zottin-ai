export interface GitHubRepository {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
}

export interface GitHubImportRequest {
  owner: string;
  repo: string;
  branch: string;
}
