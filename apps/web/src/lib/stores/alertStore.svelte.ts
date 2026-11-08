import { browser } from "$app/environment";

export type AlertType = "danger" | "warning" | "success" | "info";

export interface DialogActionButton {
  label: string;
  onClick: () => void | Promise<void>;
  class?: string;
}

export interface DialogOptions {
  id?: string;
  type?: AlertType;
  title: string;
  message: string;
  details?: string[] | string;
  isConfirm?: boolean;
  confirmText?: string;
  cancelText?: string;
  confirmClass?: string;
  cancelClass?: string;
  autoClose?: number; // Durasi ms sebelum meredup/tutup otomatis (opsional)
  actionButton?: DialogActionButton;
  showCloseButton?: boolean;
}

export interface ActiveDialog extends DialogOptions {
  id: string;
  type: AlertType;
  resolve: (value: boolean) => void;
  timerId?: any;
}

export interface ToastOptions {
  id?: string;
  type?: AlertType;
  title?: string;
  message: string;
  duration?: number; // default 3500ms
  isSpinning?: boolean;
  variant?: "glass-dark" | "glass-light";
}

export interface ToastItem {
  id: string;
  type: AlertType;
  title?: string;
  message: string;
  duration: number;
  isSpinning?: boolean;
  variant: "glass-dark" | "glass-light";
  isExiting?: boolean;
  timerId?: any;
}

export class AlertState {
  currentDialog = $state<ActiveDialog | null>(null);
  toasts = $state<ToastItem[]>([]);

  /**
   * Menampilkan modal dialog peringatan dengan tombol OK / Aksi
   */
  show(options: DialogOptions): Promise<boolean> {
    if (!browser) return Promise.resolve(true);

    return new Promise((resolve) => {
      // Bersihkan dialog sebelumnya jika ada
      if (this.currentDialog?.timerId) {
        clearTimeout(this.currentDialog.timerId);
      }

      const id = options.id || "dlg_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const type = options.type || "warning";

      let timerId: any = null;
      if (options.autoClose && options.autoClose > 0) {
        timerId = setTimeout(() => {
          this.closeDialog(false);
        }, options.autoClose);
      }

      this.currentDialog = {
        ...options,
        id,
        type,
        isConfirm: options.isConfirm ?? false,
        confirmText: options.confirmText || (options.isConfirm ? "Lanjutkan" : "Mengerti & Tutup"),
        cancelText: options.cancelText || "Batal",
        showCloseButton: options.showCloseButton ?? true,
        resolve,
        timerId
      };
    });
  }

  /**
   * Menampilkan modal dialog konfirmasi (Dua tombol: Lanjutkan vs Batal)
   */
  confirm(options: Omit<DialogOptions, "isConfirm">): Promise<boolean> {
    return this.show({
      ...options,
      isConfirm: true
    });
  }

  /**
   * Shortcut Alert Danger / Error (Merah)
   */
  danger(title: string, message: string, options?: Partial<DialogOptions>): Promise<boolean> {
    return this.show({
      title,
      message,
      type: "danger",
      ...options
    });
  }

  /**
   * Shortcut Alert Warning / Peringatan (Kuning/Oranye)
   */
  warning(title: string, message: string, options?: Partial<DialogOptions>): Promise<boolean> {
    return this.show({
      title,
      message,
      type: "warning",
      ...options
    });
  }

  /**
   * Shortcut Alert Success (Hijau)
   */
  success(title: string, message: string, options?: Partial<DialogOptions>): Promise<boolean> {
    return this.show({
      title,
      message,
      type: "success",
      ...options
    });
  }

  /**
   * Shortcut Alert Info (Biru)
   */
  info(title: string, message: string, options?: Partial<DialogOptions>): Promise<boolean> {
    return this.show({
      title,
      message,
      type: "info",
      ...options
    });
  }

  /**
   * Menutup dialog aktif
   */
  closeDialog(result: boolean = false) {
    if (!this.currentDialog) return;
    if (this.currentDialog.timerId) {
      clearTimeout(this.currentDialog.timerId);
    }
    const resolve = this.currentDialog.resolve;
    this.currentDialog = null;
    resolve(result);
  }

  /**
   * Menampilkan Toast notifikasi melayang yang transparan dan meredup otomatis (fadeout)
   * Mendukung pemanggilan format string sederhana maupun objek opsi multi-parameter
   */
  toast(
    optionsOrMessage: string | ToastOptions,
    type: AlertType = "info",
    title?: string,
    duration: number = 3500
  ): string {
    if (!browser) return "";

    const opts: ToastOptions =
      typeof optionsOrMessage === "string"
        ? { message: optionsOrMessage, type, title, duration }
        : optionsOrMessage;

    const id = opts.id || "tst_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const toastDuration = opts.duration ?? 3500;
    const toastType = opts.type || "info";
    const toastVariant = opts.variant || "glass-dark";

    const timerId =
      toastDuration > 0
        ? setTimeout(() => {
            this.removeToast(id);
          }, toastDuration)
        : undefined;

    const item: ToastItem = {
      id,
      type: toastType,
      title: opts.title,
      message: opts.message,
      duration: toastDuration,
      isSpinning: opts.isSpinning ?? false,
      variant: toastVariant,
      isExiting: false,
      timerId
    };

    // Jika sudah ada toast dengan pesan yang sama persis, gantikan agar tidak menumpuk
    const existingIndex = this.toasts.findIndex((t) => t.message === item.message);
    if (existingIndex !== -1) {
      if (this.toasts[existingIndex].timerId) clearTimeout(this.toasts[existingIndex].timerId);
      this.toasts[existingIndex] = item;
      return id;
    }

    // Maksimal 4 toast bersamaan
    if (this.toasts.length >= 4) {
      const oldest = this.toasts[0];
      if (oldest.timerId) clearTimeout(oldest.timerId);
      this.toasts = [...this.toasts.slice(1), item];
    } else {
      this.toasts = [...this.toasts, item];
    }

    return id;
  }

  /**
   * Menghilangkan toast dengan transisi fadeout halus
   */
  removeToast(id: string) {
    const item = this.toasts.find((t) => t.id === id);
    if (!item) return;

    if (item.timerId) clearTimeout(item.timerId);
    item.isExiting = true;

    // Beri waktu 280ms untuk animasi CSS fadeout meredup sebelum dihapus dari memori
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 280);
  }
}

export const alertStore = new AlertState();

