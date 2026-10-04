import { Check, Trash2, X } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../atoms/icon-button.tsx";

export type ConfirmDeleteLabels = {
  delete: (label: string) => string;
  confirm: (label: string) => string;
  cancel: string;
};

export const DEFAULT_CONFIRM_DELETE_LABELS: ConfirmDeleteLabels = {
  delete: (label) => `Delete ${label}`,
  confirm: (label) => `Confirm deleting ${label}`,
  cancel: "Cancel",
};

export function ConfirmDelete({
  label,
  onConfirm,
  disabled,
  labels = DEFAULT_CONFIRM_DELETE_LABELS,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  labels?: ConfirmDeleteLabels;
}) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <IconButton
        icon={Trash2}
        label={labels.delete(label)}
        variant="danger"
        disabled={disabled}
        onClick={() => setArmed(true)}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <IconButton icon={Check} label={labels.confirm(label)} variant="danger" onClick={onConfirm} />
      <IconButton icon={X} label={labels.cancel} onClick={() => setArmed(false)} />
    </span>
  );
}
