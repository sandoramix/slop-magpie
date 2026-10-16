import { Alert, type AlertButton } from "react-native";
import { useDialog } from "@/stores/dialog";

// Android's native dialog shows at most three buttons and ignores the rest, and it ignores the
// back button unless `cancelable` is set. This wrapper fixes both: it is cancelable, and longer
// menus open in the in-app sheet (components/dialog-host.tsx), which has a close button.
const NATIVE_MAX_BUTTONS = 3;

type Options = {
  /** Runs when the dialog is closed without choosing a button (back button, tap outside, X). */
  onDismiss?: () => void;
};

export function alert(title: string, message?: string, buttons: AlertButton[] = [{ text: "OK" }], options: Options = {}): void {
  if (buttons.length > NATIVE_MAX_BUTTONS) {
    useDialog.getState().show({
      title,
      ...(message === undefined ? {} : { message }),
      buttons,
      ...(options.onDismiss ? { onDismiss: options.onDismiss } : {}),
    });
    return;
  }
  Alert.alert(title, message, buttons, { cancelable: true, ...(options.onDismiss ? { onDismiss: options.onDismiss } : {}) });
}
