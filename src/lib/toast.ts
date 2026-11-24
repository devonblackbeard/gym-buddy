const EVENT = "app:toast";

export interface ToastMessage {
  text: string;
  tone: "error" | "info";
}

export function toast(text: string, tone: ToastMessage["tone"] = "error") {
  window.dispatchEvent(new CustomEvent<ToastMessage>(EVENT, { detail: { text, tone } }));
}

export function onToast(listener: (message: ToastMessage) => void) {
  const handler = (e: Event) => listener((e as CustomEvent<ToastMessage>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
