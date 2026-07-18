-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleNodeId" TEXT NOT NULL,
    "kind" "PlacementKind" NOT NULL,
    "canCreateSubgroups" BOOLEAN NOT NULL DEFAULT false,
    "invitedByProfileId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_orgId_roleNodeId_idx" ON "Invitation"("orgId", "roleNodeId");
