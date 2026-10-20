import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { createCoalescer, type EngineEventKind, keysFor } from "./engine-events.js";

/** Subscribes to the server-sent event stream and invalidates the affected queries. */
export const useEngineEvents = (): void => {
  const qc = useQueryClient();
  useEffect(() => {
    const coalescer = createCoalescer((kinds) => {
      for (const kind of kinds)
        for (const queryKey of keysFor(kind)) void qc.invalidateQueries({ queryKey });
    });
    const source = new EventSource("/api/v1/events");
    source.onmessage = (event) => {
      try {
        coalescer.push((JSON.parse(event.data) as { kind: EngineEventKind }).kind);
      } catch {
        /* ignore malformed message */
      }
    };
    return () => {
      source.close();
      coalescer.cancel();
    };
  }, [qc]);
};
