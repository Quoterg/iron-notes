// iPhone/iPad detection for the install hint (Settings) and for hiding the Android-app move button.
// Pure: the user agent and the standalone flags go in, a boolean comes out.

/** An iPhone, iPod or iPad (iPadOS in desktop mode reports itself as a Mac and is not detected). */
export const isIos = (ua: string): boolean => /iPhone|iPad|iPod/.test(ua);

/**
 * Show "Install on iPhone: tap Share, then Add to Home Screen": an iPhone or iPad in Safari that is not
 * running the Home Screen app yet. Other iOS browsers (Chrome, Firefox, Edge, Opera) are left out, and so
 * is the app itself (`navigator.standalone` on iOS, or `display-mode: standalone` elsewhere).
 */
export function needsIosInstallHint(ua: string, standalone: boolean): boolean {
  if (!isIos(ua) || standalone) return false;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua)) return false;
  return /Safari\//.test(ua);
}
