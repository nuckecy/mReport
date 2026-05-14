"use client";

// "Download original .xlsx" button. Calls the signed-URL action, then
// kicks off the download via a transient `<a>` element.

import { useState, useTransition } from "react";
import { CircleAlert, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createReportFileSignedUrlAction } from "@/lib/reports/actions";

export interface DownloadFileButtonProps {
  reportId: string;
}

export function DownloadFileButton({ reportId }: DownloadFileButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await createReportFileSignedUrlAction({ reportId });
      if (result.status === "success") {
        // Trigger the download. Using a hidden <a> is more reliable than
        // setting window.location, especially for cross-origin signed URLs.
        const a = document.createElement("a");
        a.href = result.url;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="md" disabled={pending} onClick={onClick}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-pulse" aria-hidden />
            Preparing…
          </>
        ) : (
          <>
            <Download className="size-4" aria-hidden />
            Download original .xlsx
          </>
        )}
      </Button>
      {error ? (
        <span className="text-bad inline-flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" aria-hidden />
          {error}
        </span>
      ) : null}
    </div>
  );
}
