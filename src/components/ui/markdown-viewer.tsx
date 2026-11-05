"use client";

import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export const MarkdownViewer = React.memo(function MarkdownViewer({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const safeContent = useMemo(() => {
    if (!content) return "";
    return content
      .slice(0, 120_000)
      .replace(/-{8,}/g, "---")
      .replace(/={8,}/g, "===")
      .replace(/\[!ÖNEMLİ\]/g, "**ÖNEMLİ:**")
      .replace(/\[!IMPORTANT\]/g, "**ÖNEMLİ:**")
      .replace(/\[!NOTE\]/g, "**NOT:**")
      .replace(/\[!TIP\]/g, "**İPUCU:**");
  }, [content]);

  return (
    <div
      className={cn(
        "academic-prose text-slate-800 dark:text-slate-200",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{safeContent}</ReactMarkdown>
    </div>
  );
});
