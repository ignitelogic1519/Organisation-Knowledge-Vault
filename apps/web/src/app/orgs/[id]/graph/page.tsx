"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

// The constellation moved to the org's main page — keep old /graph links working.
export default function GraphRedirect() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    router.replace(`/orgs/${id}`);
  }, [id, router]);
  return null;
}
