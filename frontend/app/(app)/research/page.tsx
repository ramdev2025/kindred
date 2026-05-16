"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import ResearchPanel from "@/components/ResearchPanel";

export default function ResearchPage() {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    getToken().then(setToken);
  }, [getToken]);

  return (
    <div className="flex-1 h-full overflow-hidden">
      <ResearchPanel token={token} />
    </div>
  );
}
