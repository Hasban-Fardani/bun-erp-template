import { useI18n } from "@bun-erp/i18n/react";
import { IconButton } from "@bun-erp/ui/atoms/icon-button.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@bun-erp/ui/organisms/alert-dialog.tsx";
import { Eye } from "lucide-react";

/** Row action + confirm dialog: impersonating gives full access as the user, so it is never one click. */
export function ImpersonateDialog({
  name,
  disabled,
  onConfirm,
}: {
  name: string;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <IconButton icon={Eye} label={t("impersonation.actionNamed", { name })} disabled={disabled} />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("impersonation.confirmTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("impersonation.confirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("impersonation.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t("impersonation.confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
