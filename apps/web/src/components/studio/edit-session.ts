"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/auth-client";
import { courses, type CourseDetail } from "@/lib/courses-client";

// Revising something already published. The rule both editors follow: a course that is
// still deployed cannot be republished under people who are reading (or sitting) it — it is
// taken OUT OF DEPLOYMENT first, revised, and published as the next edition, which puts it
// back on the same placements with its version bumped (v1.0 → v2.0).

export interface CourseEditSession {
  code: string | null;
  detail: CourseDetail | null;
  /** Still deployed — the state that blocks publishing a new edition. */
  live: boolean;
  busy: boolean;
  error: string | null;
  /** Take it out of deployment / put it back without changing anything. */
  setDeployed: (deployed: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

export function useCourseEdit(code: string | null): CourseEditSession {
  const [detail, setDetail] = useState<CourseDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!code) return;
    try {
      setDetail(await courses.info(code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this course");
    }
  }, [code]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setDeployed = useCallback(
    async (deployed: boolean) => {
      if (!code) return;
      setBusy(true);
      try {
        await courses.withdraw(code, !deployed);
        await reload();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not change the deployment");
      } finally {
        setBusy(false);
      }
    },
    [code, reload],
  );

  return {
    code,
    detail,
    live: !!detail && !detail.withdrawn,
    busy,
    error,
    setDeployed,
    reload,
  };
}
