import { translate } from "./i18n";
export interface ChatComposerStateInput {
  disabled?: boolean;
  isSubmitting?: boolean;
  value: string;
}

export interface ChatComposerState {
  canSubmit: boolean;
  inputDisabled: boolean;
  submitLabel: string;
}

interface ChatComposerKeyInput {
  isComposing: boolean;
  key: string;
  shiftKey: boolean;
}

export function getChatComposerState({ disabled = false, isSubmitting = false, value }: ChatComposerStateInput): ChatComposerState {
  return {
    canSubmit: !disabled && !isSubmitting && value.trim().length > 0,
    inputDisabled: disabled,
    submitLabel: isSubmitting ? translate("ui.899dce11fb2c") : translate("ui.ceb68a9287da"),
  };
}

export function shouldSubmitChatComposerKey({ isComposing, key, shiftKey }: ChatComposerKeyInput, canSubmit: boolean) {
  return key === "Enter" && !shiftKey && !isComposing && canSubmit;
}
