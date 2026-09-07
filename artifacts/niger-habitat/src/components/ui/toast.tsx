import type { ReactNode } from 'react';

export type ToastActionElement = ReactNode;

export type ToastProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ToastActionElement;
};
