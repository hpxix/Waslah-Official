import { toast } from "sonner";
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
    duration: options.timeout ?? 4500,
    action: options.action
      ? { label: options.action.label, onClick: options.action.onAction }
      : undefined,
  };
}

export const notify = {
  success(message: ReactNode, options?: NoticeOptions) {
    return toast.success(message, optionsFor(options));
  },
  danger(message: ReactNode, options?: NoticeOptions) {
    return toast.error(message, optionsFor(options));
  },
  info(message: ReactNode, options?: NoticeOptions) {
    return toast.info(message, optionsFor(options));
  },
  warning(message: ReactNode, options?: NoticeOptions) {
    return toast.warning(message, optionsFor(options));
  },
  close(id: string | number) {
    toast.dismiss(id);
  },
};
