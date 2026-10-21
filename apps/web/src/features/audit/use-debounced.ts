import { useEffect, useState } from "react";

/** The value after it stopped changing for `ms`: keeps a search box from asking on every key. */
export const useDebounced = <T>(value: T, ms = 300): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
};
