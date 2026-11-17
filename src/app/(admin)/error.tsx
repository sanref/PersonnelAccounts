"use client";

import { FeedbackBanner } from "@/components/ui-feedback";

export default function AdminError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <FeedbackBanner
      error
      message="No pudimos cargar esta pantalla. Revisá tu conexión y volvé a intentarlo."
      onRetry={retry}
    />
  );
}
