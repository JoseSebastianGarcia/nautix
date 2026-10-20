import { type QueryKey, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToasts } from "../components/toast-store.js";
import { ApiError } from "./api.js";

/** Runs an API call, refreshes the given queries and shows a translated toast on success/failure. */
export const useApiMutation = <V, R = unknown>(
  fn: (variables: V) => Promise<R>,
  invalidate: QueryKey[],
  successText?: (variables: V, result: R) => string,
) => {
  const qc = useQueryClient();
  const push = useToasts((s) => s.push);
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result, variables) => {
      if (successText) push("ok", successText(variables, result));
    },
    onError: (error) => {
      const key = error instanceof ApiError ? error.hintKey : undefined;
      push("error", key ? t(key) : t("errors.generic"));
    },
    onSettled: () => {
      for (const queryKey of invalidate) void qc.invalidateQueries({ queryKey });
    },
  });
};
