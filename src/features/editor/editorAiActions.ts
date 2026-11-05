import { translate } from "../../shared/i18n";
import type { NoteAiActionId } from "../../services/noteAiService";

export interface EditorAiActionItem {
  id: NoteAiActionId;
  label: string;
}

export interface EditorAiActionGroup {
  id: string;
  items: EditorAiActionItem[];
}

export const EDITOR_AI_ACTION_GROUPS: readonly EditorAiActionGroup[] = [
  {
    id: "rewrite",
    items: [
      { id: "improve", get label() { return translate("ui.89a537789de8"); } },
      { id: "fix", get label() { return translate("ui.5bd8cfde875a"); } },
      { id: "shorten", get label() { return translate("ui.f747d976b67f"); } },
      { id: "expand", get label() { return translate("ui.59f82b81874d"); } },
    ],
  },
  {
    id: "transform",
    items: [
      { id: "tone", get label() { return translate("ui.dc65da6126ed"); } },
      { id: "tasks", get label() { return translate("ui.20bb5c3b3ae1"); } },
      { id: "translate", get label() { return translate("ui.4ac45591613f"); } },
      { id: "explain", get label() { return translate("ui.c4710bcb6e10"); } },
    ],
  },
];
