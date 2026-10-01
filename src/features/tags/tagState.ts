import type { Note, TagRow } from "../../app/types";

function toNoteTag(tag: TagRow) {
  return {
    color: tag.color,
    customColor: tag.customColor,
    iconKey: tag.iconKey,
    id: tag.id,
    name: tag.name,
  };
}

export function replaceTagInNotes(notes: Note[], updatedTag: TagRow) {
  return notes.map((note) => ({
    ...note,
    tags: note.tags.map((tag) => tag.id === updatedTag.id ? toNoteTag(updatedTag) : tag),
  }));
}

export function removeTagFromNotes(notes: Note[], tagId: string) {
  return notes.map((note) => ({ ...note, tags: note.tags.filter((tag) => tag.id !== tagId) }));
}

export function mergeTagInNotes(notes: Note[], sourceTagId: string, targetTag: TagRow) {
  return notes.map((note) => {
    const sourceIndex = note.tags.findIndex((tag) => tag.id === sourceTagId);
    if (sourceIndex < 0) return note;
    const targetIndex = note.tags.findIndex((tag) => tag.id === targetTag.id);
    const insertIndex = targetIndex < 0 ? sourceIndex : Math.min(sourceIndex, targetIndex);
    const tags = note.tags.filter((tag) => tag.id !== sourceTagId && tag.id !== targetTag.id);
    tags.splice(insertIndex, 0, toNoteTag(targetTag));
    return { ...note, tags };
  });
}
