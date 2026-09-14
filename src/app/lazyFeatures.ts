import { lazy } from "react";

export async function loadProjectsFeature() {
  const module = await import("../features/projects/ProjectsPage");
  return { default: module.ProjectsPage };
}

export async function loadTagsFeature() {
  const module = await import("../features/tags/TagsPage");
  return { default: module.TagsPage };
}

export async function loadArchiveFeature() {
  const module = await import("../features/archive/ArchivePage");
  return { default: module.ArchivePage };
}

export async function loadSettingsFeature() {
  const module = await import("../features/settings/SettingsPage");
  return { default: module.SettingsPage };
}

export async function loadRagFeature() {
  const module = await import("../features/rag/RagChatPage");
  return { default: module.RagChatPage };
}

export async function loadImageEditorFeature() {
  const module = await import("../features/imageEditor/ImageEditorModal");
  return { default: module.ImageEditorModal };
}

export const LazySettingsPage = lazy(loadSettingsFeature);
export const LazyRagChatPage = lazy(loadRagFeature);
export const LazyImageEditorModal = lazy(loadImageEditorFeature);
export const LazyProjectsPage = lazy(loadProjectsFeature);
export const LazyTagsPage = lazy(loadTagsFeature);
export const LazyArchivePage = lazy(loadArchiveFeature);
