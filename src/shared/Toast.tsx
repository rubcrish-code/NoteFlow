export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  action?: ToastAction | null;
  message: string | null;
  tone?: "error" | "neutral" | "success";
}

export function Toast({ action, message, tone }: ToastProps) {
  const resolvedTone = tone ?? (message?.startsWith("Не удалось") ? "error" : "neutral");

  return (
    <div
      aria-atomic="true"
      aria-live={resolvedTone === "error" ? "assertive" : "polite"}
      className={`toast ${message ? "show" : ""} ${action ? "has-action" : ""}`}
      data-tone={resolvedTone}
      role={resolvedTone === "error" ? "alert" : "status"}
    >
      <span>{message}</span>
      {message && action ? (
        <button onClick={action.onClick} type="button">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
