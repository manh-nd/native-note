"use client";

import { useCallback, useState } from "react";
import type { Editor } from "@tiptap/core";

export type SlashCommandItem = {
  key: string;
  label: string;
  hint?: string;
  icon?: unknown;
};

export type SlashMenuState = {
  open: boolean;
  query: string;
  x: number;
  y: number;
  selected: number;
};

export function filterSlashCommands<T extends SlashCommandItem>(
  commands: T[],
  query: string
): T[] {
  if (!query.trim()) return commands;
  const q = query.toLowerCase();
  return commands.filter((cmd) =>
    `${cmd.key} ${cmd.label} ${cmd.hint ?? ""}`.toLowerCase().includes(q)
  );
}

export function useSlashMenu() {
  const [slashState, setSlashState] = useState<SlashMenuState>({
    open: false,
    query: "",
    x: 0,
    y: 0,
    selected: 0,
  });

  const closeSlashMenu = useCallback(() => {
    setSlashState((prev) => ({ ...prev, open: false, query: "", selected: 0 }));
  }, []);

  const openSlashMenu = useCallback((coords: { x: number; y: number }) => {
    setSlashState({
      open: true,
      query: "",
      x: coords.x,
      y: coords.y,
      selected: 0,
    });
  }, []);

  const updateSlashQuery = useCallback((query: string) => {
    setSlashState((prev) => ({ ...prev, query, selected: 0 }));
  }, []);

  const navigateSlashSelection = useCallback(
    (delta: number, maxCount: number) => {
      if (maxCount <= 0) return;
      setSlashState((prev) => {
        const nextIndex = (prev.selected + delta + maxCount) % maxCount;
        return { ...prev, selected: nextIndex };
      });
    },
    []
  );

  return {
    slashState,
    setSlashState,
    openSlashMenu,
    closeSlashMenu,
    updateSlashQuery,
    navigateSlashSelection,
  };
}
