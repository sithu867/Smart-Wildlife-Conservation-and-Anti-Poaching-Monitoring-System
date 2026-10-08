-- AlterTable
ALTER TABLE "ConflictResponse" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WildlifeConflictAlert" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConflictAuditEntry" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "responseId" TEXT,
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "performedName" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,

    CONSTRAINT "ConflictAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConflictAuditEntry_alertId_timestamp_idx" ON "ConflictAuditEntry"("alertId", "timestamp");

-- CreateIndex
CREATE INDEX "ConflictAuditEntry_responseId_idx" ON "ConflictAuditEntry"("responseId");

-- CreateIndex
CREATE INDEX "ConflictResponse_alertId_isDeleted_respondedAt_idx" ON "ConflictResponse"("alertId", "isDeleted", "respondedAt");

-- CreateIndex
CREATE INDEX "WildlifeConflictAlert_isDeleted_createdAt_idx" ON "WildlifeConflictAlert"("isDeleted", "createdAt");

-- AddForeignKey
ALTER TABLE "ConflictAuditEntry" ADD CONSTRAINT "ConflictAuditEntry_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "WildlifeConflictAlert"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictAuditEntry" ADD CONSTRAINT "ConflictAuditEntry_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "ConflictResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
