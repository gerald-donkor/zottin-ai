-- CreateTable
CREATE TABLE "WorkspaceVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileData" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceVersion_workspaceId_createdAt_idx" ON "WorkspaceVersion"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceVersion" ADD CONSTRAINT "WorkspaceVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
