// Platform-unique course codes: <org-number>-<role-number>-<item-number>
// e.g. "456-989-0001" (docs/structure.md §3.1). Org numbers are platform-unique and never
// reused; role numbers are unique within their org and never reused.

export interface CourseCodeParts {
  orgNumber: number;
  roleNumber: number;
  itemNumber: number;
}

const COURSE_CODE_RE = /^(\d+)-(\d+)-(\d{4,})$/;

export function formatCourseCode({ orgNumber, roleNumber, itemNumber }: CourseCodeParts): string {
  return `${orgNumber}-${roleNumber}-${String(itemNumber).padStart(4, "0")}`;
}

export function parseCourseCode(code: string): CourseCodeParts | null {
  const m = COURSE_CODE_RE.exec(code);
  if (!m) return null;
  return {
    orgNumber: Number(m[1]),
    roleNumber: Number(m[2]),
    itemNumber: Number(m[3]),
  };
}
