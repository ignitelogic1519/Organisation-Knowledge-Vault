-- Hidden cascades down a branch: a public node under a hidden ancestor is effectively
-- hidden (computed, no schema change). Branch owners blocked that way can now file a
-- "Visibility request" — a new request category.

-- AlterEnum
ALTER TYPE "RequestKind" ADD VALUE 'VISIBILITY';
