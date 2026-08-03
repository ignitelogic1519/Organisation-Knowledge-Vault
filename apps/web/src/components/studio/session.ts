"use client";

import { useCallback, useEffect, useState } from "react";
import type { OrgPlanLimitsView, StudioDraftSummary, TreeNode } from "@vault/shared";
import { courses } from "@/lib/courses-client";
import { roles } from "@/lib/orgs-client";
import { studio } from "@/lib/studio-client";

// What every Studio editor needs before it can let anyone write: which branch is being
// authored for, whether this person may publish there or only propose, what the
// organization's plan still allows, and which drafts are parked on the server. Both
// creation modes (document and exam) sit on this, so the rules can never diverge between
// them.

export interface StudioSession {
  /** The branch being authored for — null while loading, or when it can't be read. */
  node: TreeNode | null;
  limits: OrgPlanLimitsView | null;
  drafts: StudioDraftSummary[];
  /** Existing library shelves, offered as suggestions. */
  categories: string[];
  /** Publishes straight to the branch. */
  canPublish: boolean;
  /** Member with content rights — their work goes to a manager for review. */
  canPropose: boolean;
  canProceed: boolean;
  needsReview: boolean;
  /** The Studio document allowance is spent. */
  quotaFull: boolean;
  reloadPlan: () => void;
}

export function useStudioSession(
  orgId: string,
  roleId: string | null,
  isSupremeOwner: boolean,
): StudioSession {
  const [node, setNode] = useState<TreeNode | null>(null);
  // Every branch the user owns — publish rights are computed from the tree itself,
  // robustly, rather than trusting a single per-node flag.
  const [ownedPaths, setOwnedPaths] = useState<string[]>([]);
  const [limits, setLimits] = useState<OrgPlanLimitsView | null>(null);
  const [drafts, setDrafts] = useState<StudioDraftSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    if (!roleId) return;
    roles
      .structure(orgId)
      .then((v) => {
        setNode(v.nodes.find((n) => n.id === roleId) ?? null);
        setOwnedPaths(v.nodes.filter((n) => n.my.kinds.includes("OWNER")).map((n) => n.path));
      })
      .catch(() => setNode(null));
  }, [orgId, roleId]);

  const reloadPlan = useCallback(() => {
    studio.limits(orgId).then(setLimits).catch(() => undefined);
    studio
      .drafts(orgId)
      .then((r) => setDrafts(r.drafts))
      .catch(() => setDrafts([]));
  }, [orgId]);

  useEffect(reloadPlan, [reloadPlan]);

  useEffect(() => {
    courses
      .suggestCategory(orgId, "", "")
      .then((r) => setCategories(r.categories))
      .catch(() => undefined);
  }, [orgId]);

  const ownsHereOrAbove =
    !!node && ownedPaths.some((p) => node.path === p || node.path.startsWith(`${p}.`));
  const canPublish = isSupremeOwner || ownsHereOrAbove || !!node?.my.canPublishContent;
  const canPropose = !!node?.my.canProposeContent;

  return {
    node,
    limits,
    drafts,
    categories,
    canPublish,
    canPropose,
    canProceed: !!node && (canPublish || canPropose),
    needsReview: !canPublish && canPropose,
    quotaFull: limits?.documents.remaining === 0,
    reloadPlan,
  };
}
