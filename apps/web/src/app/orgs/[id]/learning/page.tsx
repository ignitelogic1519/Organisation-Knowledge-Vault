"use client";

import { MyLearning } from "@/components/MyLearning";
import { useOrg } from "@/components/org-context";

// My Learning — the courses page every member lands on (also the redirect target when a
// non-admin clicks a constellation node): pending and completed courses only.
export default function LearningPage() {
  const { org } = useOrg();

  return (
    <div className="panel-grid stagger">
      <div className="panel glass panel-wide">
        <h2>My Learning</h2>
        <p className="auth-sub">
          Every course that reaches your position — pending first, completed below.
        </p>
        <MyLearning orgId={org.id} />
      </div>
    </div>
  );
}
