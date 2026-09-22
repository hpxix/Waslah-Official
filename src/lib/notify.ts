import { Toast } from "@heroui/react";
import type { ReactNode } from "react";

type NoticeOptions = {
  description?: ReactNode;
  timeout?: number;
  loading?: boolean;
  action?: { label: string; onAction: () => void };
};

function optionsFor(options: NoticeOptions = {}) {
  return {
    description: options.description,
    timeout: options.timeout,
    isLoading: options.loading,
    actionProps: options.action
      ? { children: options.action.label, onPress: options.action.onAction }
      : undefined,
  };
}

export const notify = {
  success(message: ReactNode, options?: NoticeOptions) {
    return Toast.toast.success(message, optionsFor(options));
  },
  danger(message: ReactNode, options?: NoticeOptions) {
    return Toast.toast.danger(message, optionsFor(options));
  },
  info(message: ReactNode, options?: NoticeOptions) {
    return Toast.toast.info(message, optionsFor(options));
  },
  warning(message: ReactNode, options?: NoticeOptions) {
    return Toast.toast.warning(message, optionsFor(options));
  },
  close(id: string) {
    Toast.toast.close(id);
  },
};
