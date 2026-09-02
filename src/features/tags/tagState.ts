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
    if (!note.tags.some((tag) => tag.id === sourceTagId)) return note;
    const tags = note.tags.filter((tag) => tag.id !== sourceTagId && tag.id !== targetTag.id);
    return { ...note, tags: [...tags, toNoteTag(targetTag)] };
  });
}
