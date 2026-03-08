export function ErrorAlert({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-ask/20 bg-ask-light px-4 py-3 text-sm text-ask flex items-start gap-2">
      <span className="shrink-0 mt-0.5">!</span>
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 text-ask/60 hover:text-ask cursor-pointer"
        >
          &times;
        </button>
      )}
    </div>
  );
}
