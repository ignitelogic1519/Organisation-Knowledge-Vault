"use client";

import Link from "next/link";
import { MyLearning } from "@/components/MyLearning";
import { useOrg } from "@/components/org-context";
import { IconShield, IconStars } from "@/components/icons";

// Overview — the normal member view. Learning and orientation only; every management
// action lives in the Admin console, every structural action in the Constellation.
export default function OrgOverviewPage() {
  const { org, isAdmin } = useOrg();

  return (
    <>
      <div className="stat-row stagger">
        <div className="stat-card glass">
          <span className="stat-n gradient-text">{org.myPlacements.length || "—"}</span>
          <span className="stat-l">Your role placements</span>
        </div>
        <div className="stat-card glass">
          <span className="stat-n gradient-text">{org.owners.length}</span>
          <span className="stat-l">
            {org.ownerRole.name} owner{org.owners.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="stat-card glass">
          <span className="stat-n gradient-text">#{org.orgNumber}</span>
          <span className="stat-l">Organization number</span>
        </div>
        <div className="stat-card glass">
          <span className="stat-n gradient-text">{org.createdAt.slice(0, 10)}</span>
          <span className="stat-l">Created</span>
        </div>
      </div>

      <div className="panel-grid stagger">
        <div className="panel glass panel-wide">
          <h2>My Learning</h2>
          <p className="auth-sub">
            Courses that reach your position — mandatory first, opt-in below.
          </p>
          <MyLearning orgId={org.id} />
        </div>

        <Link href={`/orgs/${org.id}/graph`} className="org-card glass">
          <div className="org-card-head">
            <h2>Constellation</h2>
            <span className="feature-icon">
              <IconStars />
            </span>
          </div>
          <p className="auth-sub">
            Explore the organization as a living star map — every role is a star you can
            click to see and act on.
          </p>
        </Link>

        {isAdmin && (
          <Link href={`/orgs/${org.id}/admin`} className="org-card glass">
            <div className="org-card-head">
              <h2>Admin console</h2>
              <span className="feature-icon">
                <IconShield />
              </span>
            </div>
            <p className="auth-sub">
              Manage roles, people, courses, owners, backups and the organization&apos;s
              existence — separated from the everyday view.
            </p>
          </Link>
        )}
      </div>
    </>
  );
}
