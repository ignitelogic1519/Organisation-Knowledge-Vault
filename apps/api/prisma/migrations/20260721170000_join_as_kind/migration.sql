-- Join requests now carry the desired position: member or sub-owner of the branch.

-- AlterTable
ALTER TABLE "VaultRequest" ADD COLUMN "joinAs" "PlacementKind" NOT NULL DEFAULT 'MEMBER';
