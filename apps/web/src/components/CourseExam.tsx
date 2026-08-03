"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExamPaperView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { exams } from "@/lib/exams-client";
import { ExamRunner } from "./ExamRunner";

// The server-backed half of sitting an exam: fetch this candidate's paper and wire the
// runner's two questions ("is this answer right?" and "here are my answers") to the API,
// where the marking actually happens.

export function CourseExam({ code, onCompleted }: { code: string; onCompleted?: () => void }) {
  const [paper, setPaper] = useState<ExamPaperView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPaper(await exams.paper(code));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the exam");
    }
  }, [code]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="form-error viewer-note">{error}</p>;
  if (!paper) return <div className="skeleton" style={{ minHeight: "12rem" }} />;

  // The frame fills the viewer and scrolls on its own, exactly as an authored document does.
  return (
    <div className="exam-frame">
      <ExamRunner
        paper={paper}
        onCheck={(questionId, optionIds) => exams.check(code, { questionId, optionIds })}
        onSubmit={(answers, sitting) => exams.submit(code, { answers, ...sitting })}
        // A retry asks the server for a fresh paper, so the shuffle is dealt again.
        onRetry={load}
        onCompleted={onCompleted}
      />
    </div>
  );
}
