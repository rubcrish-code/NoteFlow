import { useEffect, useState } from "react";

function readStorageValue<T extends string | number>(key: string, fallback: T, validate: (value: string) => T | null): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === null) {
    return fallback;
  }

  return validate(storedValue) ?? fallback;
}

export function usePersistentNumber(key: string, fallback: number, min: number, max: number) {
  const [value, setValue] = useState(() =>
    readStorageValue(key, fallback, (storedValue) => {
      const parsedValue = Number(storedValue);
      if (!Number.isFinite(parsedValue)) {
        return null;
      }
      return Math.min(max, Math.max(min, parsedValue));
    }),
  );

  useEffect(() => {
    window.localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
}

export function usePersistentString<T extends string>(key: string, fallback: T, allowedValues: readonly T[]) {
  const [value, setValue] = useState(() =>
    readStorageValue<T>(key, fallback, (storedValue) => {
      const foundValue = allowedValues.find((allowedValue) => allowedValue === storedValue);
      return foundValue ?? null;
    }),
  );

  useEffect(() => {
    window.localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
