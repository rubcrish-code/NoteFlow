import type { Note, NoteIconKey, NoteTag, ProjectCard, TagColor } from "../app/types";
import type { IconName } from "./Icon";

type IconSource = "default" | "note" | "project" | "tag";

interface NoteIconRegistryItem {
  iconName: IconName;
}

export interface ResolvedNoteIcon {
  color: TagColor;
  customColor?: string;
  iconName: IconName;
  source: IconSource;
}

const defaultColor: TagColor = "blue";
const defaultIconKey: NoteIconKey = "document";

const noteIconRegistry: Record<NoteIconKey, NoteIconRegistryItem> = {
  code: { iconName: "code" },
  document: { iconName: "doc" },
  idea: { iconName: "bulb" },
  person: { iconName: "person" },
  project: { iconName: "folder" },
  tag: { iconName: "tag" },
  task: { iconName: "task" },
};

const legacyIconAliases: Record<string, NoteIconKey> = {
  bulb: "idea",
  check: "task",
  doc: "document",
  folder: "project",
};

export function normalizeNoteIconKey(value: string | null | undefined): NoteIconKey | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = value.trim().toLowerCase().replace(/_/g, "-");
  if (normalizedValue in noteIconRegistry) {
    return normalizedValue as NoteIconKey;
  }

  return legacyIconAliases[normalizedValue];
}

export function resolveNoteIcon(note: Note, project?: ProjectCard): ResolvedNoteIcon {
  const primaryTag = note.tags[0];
  const colorSource = resolveColorSource(primaryTag, project);

  const noteIconKey = normalizeNoteIconKey(note.iconKey);
  if (noteIconKey) {
    return buildResolvedIcon(noteIconKey, "note", colorSource.color, colorSource.customColor);
  }

  const projectIconKey = normalizeNoteIconKey(project?.iconKey);
  if (projectIconKey) {
    return buildResolvedIcon(projectIconKey, "project", colorSource.color, colorSource.customColor);
  }

  const tagIconKey = normalizeNoteIconKey(primaryTag?.iconKey) ?? inferIconKeyFromTag(primaryTag);
  if (tagIconKey) {
    return buildResolvedIcon(tagIconKey, "tag", colorSource.color, colorSource.customColor);
  }

  return buildResolvedIcon(defaultIconKey, "default", defaultColor);
}

function resolveColorSource(primaryTag: NoteTag | undefined, project?: ProjectCard) {
  if (project) {
    return {
      color: project.color,
      customColor: undefined,
    };
  }

  if (primaryTag) {
    return {
      color: primaryTag.color,
      customColor: primaryTag.customColor,
    };
  }

  return {
    color: defaultColor,
    customColor: undefined,
  };
}

function buildResolvedIcon(iconKey: NoteIconKey, source: IconSource, color: TagColor, customColor?: string): ResolvedNoteIcon {
  return {
    color,
    customColor,
    iconName: noteIconRegistry[iconKey]?.iconName ?? noteIconRegistry[defaultIconKey].iconName,
    source,
  };
}

function inferIconKeyFromTag(tag: NoteTag | undefined): NoteIconKey | undefined {
  const tagIdentity = `${tag?.id ?? ""} ${tag?.name ?? ""}`.trim().toLowerCase();
  if (!tagIdentity) {
    return undefined;
  }

  if (tagIdentity.includes("код") || tagIdentity.includes("code") || tagIdentity.includes("api") || tagIdentity.includes("dev")) {
    return "code";
  }
  if (tagIdentity.includes("зада") || tagIdentity.includes("план") || tagIdentity.includes("planning") || tagIdentity.includes("task") || tagIdentity.includes("todo")) {
    return "task";
  }
  if (tagIdentity.includes("иде") || tagIdentity.includes("idea")) {
    return "idea";
  }
  if (tagIdentity.includes("исслед") || tagIdentity.includes("польз") || tagIdentity.includes("лич") || tagIdentity.includes("research") || tagIdentity.includes("user") || tagIdentity.includes("personal")) {
    return "person";
  }
  if (tagIdentity.includes("проект") || tagIdentity.includes("архитект") || tagIdentity.includes("project") || tagIdentity.includes("architecture")) {
    return "project";
  }
  if (tagIdentity.includes("док") || tagIdentity.includes("doc")) {
    return "document";
  }

  return "tag";
}
