import type { Locale } from '../../core/i18n';

/**
 * D-166 — every sentence of the password forms (login, sign-up, change password,
 * forgotten-password request, set a new password) in Polish, English and Arabic.
 *
 * Same pattern as `verify/verifyText.ts` and `labHandoff/labHandoffText.ts`: one
 * file holds the text, the components hold none. Polish is the first entry
 * because Polish is this product's default language; `es` falls back to English,
 * exactly as `core/i18n.ts` does for keys a pack does not supply.
 *
 * Arabic is here because the account forms are reachable in the RTL deployment
 * (`LOCALE_DIRECTION.ar === 'rtl'`, `UI_LOCALES` offers it). Direction is the
 * document's, set by `setLocale`; this file only carries words.
 *
 * Wording rules kept deliberately: the reset request NEVER says a message was
 * sent (no provider is configured — the delivery status says so in plain words),
 * and no sentence here promises a certificate, a validation or signed anything.
 */
type Triple = readonly [pl: string, en: string, ar: string];

const TEXT = {
  // --- show / hide password ---
  showPassword: ['Pokaż hasło', 'Show password', 'إظهار كلمة المرور'],
  hidePassword: ['Ukryj hasło', 'Hide password', 'إخفاء كلمة المرور'],

  // --- forgotten password: the request ---
  forgotLink: ['Nie pamiętasz hasła?', 'Forgot your password?', 'هل نسيت كلمة المرور؟'],
  requestTitle: ['Nie pamiętasz hasła?', 'Forgot your password?', 'هل نسيت كلمة المرور؟'],
  requestLead: [
    'Podaj adres e-mail konta. Przygotujemy jednorazowy link do zmiany hasła, ważny przez krótki czas.',
    'Give the account e-mail address. We prepare a single-use link to change the password, valid for a short time.',
    'أدخل البريد الإلكتروني للحساب. سنُجهّز رابطًا لمرة واحدة لتغيير كلمة المرور، صالحًا لفترة قصيرة.',
  ],
  emailLabel: ['E-mail', 'E-mail', 'البريد الإلكتروني'],
  requestSubmit: ['Poproś o zmianę hasła', 'Request a password change', 'اطلب تغيير كلمة المرور'],
  requestBusy: ['Chwila…', 'One moment…', 'لحظة…'],
  requestAccepted: [
    'Żądanie przyjęte. Jeśli istnieje konto na podany adres, link został przygotowany.',
    'Request accepted. If an account exists for that address, the link has been prepared.',
    'تم استلام الطلب. إذا كان هناك حساب بهذا البريد، فقد تم تجهيز الرابط.',
  ],
  deliveryHeading: ['Dostarczenie wiadomości', 'Message delivery', 'تسليم الرسالة'],
  deliveryExternalBlocked: [
    'Zablokowane poza Genesis: ta instancja nie ma skonfigurowanego dostawcy poczty, więc Genesis nie wysłał i nie wyśle wiadomości. Link musi przekazać administrator instancji.',
    'Blocked outside Genesis: this instance has no mail provider configured, so Genesis has not sent and will not send a message. The link has to be handed over by the instance administrator.',
    'محجوب خارج Genesis: لا يوجد مزوّد بريد مُهيَّأ في هذه النسخة، لذلك لم يُرسل Genesis أي رسالة ولن يُرسلها. يجب أن يُسلّم الرابط مسؤول النسخة.',
  ],
  deliveryUnknown: [
    'Serwer nie opisał stanu dostarczenia. Nie wiemy, czy wiadomość wyjdzie — potraktuj to jako brak dostarczenia.',
    'The server did not describe the delivery state. We do not know whether a message goes out — treat it as no delivery.',
    'لم يوضّح الخادم حالة التسليم. لا نعرف إن كانت الرسالة ستُرسل — اعتبرها عدم تسليم.',
  ],
  haveLink: ['Mam już link', 'I already have a link', 'لديّ الرابط بالفعل'],

  // --- forgotten password: setting the new one ---
  confirmTitle: ['Ustaw nowe hasło', 'Set a new password', 'عيّن كلمة مرور جديدة'],
  confirmLead: [
    'Wklej link albo sam token, który dostałeś, i wpisz nowe hasło. Token działa raz.',
    'Paste the link or the token itself and type the new password. The token works once.',
    'الصق الرابط أو الرمز نفسه واكتب كلمة المرور الجديدة. الرمز يعمل مرة واحدة.',
  ],
  tokenLabel: ['Token z linku', 'Token from the link', 'الرمز من الرابط'],
  tokenHint: ['64 znaki 0–9 i a–f', '64 characters 0–9 and a–f', '٦٤ حرفًا من 0–9 و a–f'],
  newPassword: ['Nowe hasło', 'New password', 'كلمة المرور الجديدة'],
  repeatNewPassword: ['Powtórz nowe hasło', 'Repeat the new password', 'أعد كلمة المرور الجديدة'],
  confirmSubmit: ['Zmień hasło', 'Change the password', 'غيّر كلمة المرور'],
  confirmDone: [
    'Hasło zostało zmienione. Wszystkie urządzenia zostały wylogowane — zaloguj się nowym hasłem.',
    'The password was changed. Every device was signed out — sign in with the new password.',
    'تم تغيير كلمة المرور. تم تسجيل خروج جميع الأجهزة — سجّل الدخول بكلمة المرور الجديدة.',
  ],
  goToSignIn: ['Przejdź do logowania', 'Go to sign in', 'انتقل إلى تسجيل الدخول'],

  // --- change password while signed in ---
  changeTitle: ['Zmień hasło', 'Change password', 'تغيير كلمة المرور'],
  currentPassword: ['Obecne hasło', 'Current password', 'كلمة المرور الحالية'],
  changeSubmit: ['Zapisz nowe hasło', 'Save the new password', 'احفظ كلمة المرور الجديدة'],
  changeNote: [
    'Zmiana hasła wylogowuje wszystkie urządzenia, także to.',
    'Changing the password signs out every device, this one included.',
    'تغيير كلمة المرور يسجّل خروج جميع الأجهزة، بما فيها هذا الجهاز.',
  ],

  // --- shared validation and errors (client side; the server has its own) ---
  minLengthHint: ['(min. 8 znaków)', '(at least 8 characters)', '(٨ أحرف على الأقل)'],
  errEmail: ['Podaj poprawny adres e-mail.', 'Give a valid e-mail address.', 'أدخل بريدًا إلكترونيًا صحيحًا.'],
  errTooShort: ['Hasło musi mieć co najmniej 8 znaków.', 'The password needs at least 8 characters.', 'يجب أن تكون كلمة المرور ٨ أحرف على الأقل.'],
  errMismatch: ['Hasła nie są takie same.', 'The passwords are not the same.', 'كلمتا المرور غير متطابقتين.'],
  errTokenShape: [
    'To nie wygląda na token z linku: potrzeba dokładnie 64 znaków 0–9 i a–f.',
    'This does not look like a token from the link: it needs exactly 64 characters 0–9 and a–f.',
    'لا يبدو هذا رمزًا من الرابط: يحتاج إلى ٦٤ حرفًا بالضبط من 0–9 و a–f.',
  ],
  errOffline: ['Brak połączenia z serwerem.', 'No connection to the server.', 'لا يوجد اتصال بالخادم.'],
} as const satisfies Record<string, Triple>;

export type PasswordAuthTextKey = keyof typeof TEXT;

/** Index into a triple. Spanish has no entry in this pack, so it reads English — as `t()` does. */
function indexFor(locale: Locale): 0 | 1 | 2 {
  if (locale === 'pl') return 0;
  if (locale === 'ar') return 2;
  return 1;
}

export function pwText(key: PasswordAuthTextKey, locale: Locale): string {
  return TEXT[key][indexFor(locale)];
}

/** The minimum the client checks before sending. The server's policy is the one that decides. */
export const CLIENT_PASSWORD_MIN_LENGTH = 8;

/** Shape of a reset token as the backend issues it (passwordReset.mjs). */
export const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Pure state → attributes for the show/hide toggle. Tested without a DOM, and
 * the only place that decides what the button says and which type the input has.
 */
export function passwordToggleState(visible: boolean, locale: Locale): {
  inputType: 'text' | 'password';
  pressed: boolean;
  label: string;
  icon: string;
} {
  return visible
    ? { inputType: 'text', pressed: true, label: pwText('hidePassword', locale), icon: '🙈' }
    : { inputType: 'password', pressed: false, label: pwText('showPassword', locale), icon: '👁' };
}
