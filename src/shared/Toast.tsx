export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastProps {
  action?: ToastAction | null;
  message: string | null;
}

export function Toast({ action, message }: ToastProps) {
  return (
    <div className={`toast ${message ? "show" : ""} ${action ? "has-action" : ""}`}>
      <span>{message}</span>
      {message && action ? (
        <button onClick={action.onClick} type="button">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
