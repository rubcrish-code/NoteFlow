import { useEffect, useRef, type KeyboardEvent } from "react";
import { Icon } from "./Icon";
import { getChatComposerState, shouldSubmitChatComposerKey } from "./chatComposerState";

interface ChatComposerProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  placeholder: string;
  value: string;
}

export function ChatComposer({
  ariaLabel,
  className = "",
  disabled = false,
  isSubmitting = false,
  onChange,
  onSubmit,
  onStop,
  placeholder,
  value,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const state = getChatComposerState({ disabled, isSubmitting, value });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = value.length === 0 ? "32px" : `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
      return;
    }

    event.preventDefault();
    if (
      shouldSubmitChatComposerKey(
        {
          isComposing: event.nativeEvent.isComposing,
          key: event.key,
          shiftKey: event.shiftKey,
        },
        state.canSubmit,
      )
    ) {
      onSubmit();
    }
  }

  return (
    <div className={`chat-composer ${className}`.trim()}>
      <textarea
        aria-label={ariaLabel}
        disabled={state.inputDisabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      <button
        aria-label={isSubmitting && onStop ? "Остановить" : state.submitLabel}
        className="chat-composer-send"
        disabled={isSubmitting && onStop ? false : !state.canSubmit}
        onClick={isSubmitting && onStop ? onStop : onSubmit}
        data-tooltip={isSubmitting && onStop ? "Остановить" : disabled ? "Сначала подключите модель" : state.submitLabel}
        type="button"
      >
        {isSubmitting && onStop ? <Icon name="x" /> : isSubmitting ? <span className="button-spinner" /> : <Icon name="send" />}
      </button>
    </div>
  );
}
