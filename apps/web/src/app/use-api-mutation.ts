import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToasts } from "../components/toast-store.js";
import { ApiError } from "./api.js";

/**
 * Runs an API call, refreshes the given queries and shows a translated toast on success/failure.
 * With `pendingText`, a progress toast stays on screen until the call settles, so long operations
 * (pulling a big image) can continue after their dialog has closed.
 */
export const useApiMutation = <V, R = unknown>(
  fn: (variables: V) => Promise<R>,
  invalidate: QueryKey[],
  successText?: (variables: V, result: R) => string,
  pendingText?: (variables: V) => string,
) => {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const dismiss = useToasts((s) => s.dismiss);
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onMutate: (variables): number | undefined =>
      pendingText ? push("pending", pendingText(variables)) : undefined,
    onSuccess: (result, variables) => {
      if (successText) push("ok", successText(variables, result));
    },
    onError: (error) => {
      const key = error instanceof ApiError ? error.hintKey : undefined;
      const base = key ? t(key) : t("errors.generic");
      // Docker's own reason is the only useful part of a rejected swarm call.
      const why = key === "errors.swarmRejected" && error instanceof ApiError ? error.detail : "";
      push("error", why ? `${base}: ${why}` : base);
    },
    onSettled: (_data, _error, _variables, pendingId) => {
      if (pendingId !== undefined) dismiss(pendingId);
      for (const queryKey of invalidate) void qc.invalidateQueries({ queryKey });
    },
  });
};
