"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

export function useMarkAsUnread() {
  const qc = useQueryClient();
  const t = useT();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post<{ data: unknown }>(`/api/v1/conversations/${id}/mark-unread`, {}),
    onSuccess: (_data, id) => {
      toast.success(t("Conversa marcada como não lida."));
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
    onError: showApiError,
  });
}
