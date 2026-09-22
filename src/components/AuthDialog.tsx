import confetti from "canvas-confetti";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Gift,
  LoaderCircle,
  LockKeyhole,
  Smartphone,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  apiErrorMessage,
  apiErrorCode,
  completeSocialAccount,
  confirmPhoneVerification,
  getAccount,
  getSocialIdentity,
  hasDirectus,
  loginAccount,
  registerAccount,
  requestPhoneVerification,
} from "../lib/directus";
import type { SocialIdentity } from "../lib/directus";
import { accountToAuthUser } from "../lib/authUser";
import type { AuthUser } from "../lib/authUser";
import { LanguageToggle, useLanguage } from "../i18n";
import { WaslaBrand } from "./WaslaBrand";

type AuthDialogProps = {
  initialMode?: Mode;
  open: boolean;
  user: AuthUser | null;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
  onCelebration: (message: { title: string; body: string }) => void;
  onReady: (user: AuthUser) => void;
};

type Mode = "signup" | "login";
type Step = "account" | "social" | "verify";
const consentVersion = "2026-08-20";

function saudiPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("966")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 9);
}

function validSaudiPhone(value: string) {
  return /^5\d{8}$/.test(value);
}

function exactAuthError(
  cause: unknown,
  language: "ar" | "en",
  fallback: string,
) {
  const code = apiErrorCode(cause);
  const messages: Record<string, { ar: string; en: string }> = {
    EMAIL_EXISTS: {
      ar: "يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل.",
      en: "An account already exists with this email address.",
    },
    PHONE_EXISTS: {
      ar: "رقم الجوال مستخدم في حساب آخر بالفعل.",
      en: "This mobile number is already connected to another account.",
    },
    INVALID_SAUDI_PHONE: {
      ar: "أدخل 9 أرقام لرقم جوال سعودي يبدأ بالرقم 5، من دون الصفر الأول.",
      en: "Enter exactly 9 digits for a Saudi mobile number, starting with 5 and without the first 0.",
    },
    INVALID_NAME: {
      ar: "أدخل اسمك الكامل بحرفين على الأقل.",
      en: "Enter your full name using at least 2 characters.",
    },
    INVALID_BUSINESS: {
      ar: "أدخل اسم المنشأة بحرفين على الأقل.",
      en: "Enter your organization name using at least 2 characters.",
    },
    INVALID_EMAIL: {
      ar: "صيغة البريد الإلكتروني غير صحيحة.",
      en: "The email address format is invalid.",
    },
    CONSENT_REQUIRED: {
      ar: "وافق على سياسة الخصوصية والصلاحيات لإنشاء الحساب.",
      en: "Accept the Privacy Policy and Permissions to create your account.",
    },
    WEAK_PASSWORD: {
      ar: "كلمة المرور يجب أن تتكون من 10 أحرف على الأقل.",
      en: "Your password must contain at least 10 characters.",
    },
    INVALID_CREDENTIALS: {
      ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      en: "The email address or password is incorrect.",
    },
    INVALID_OTP: {
      ar: "رمز التحقق غير صحيح. تحقق من الرمز وحاول مجدداً.",
      en: "The verification code is incorrect. Check the code and try again.",
    },
    OTP_EXPIRED: {
      ar: "انتهت صلاحية رمز التحقق. اطلب رمزاً جديداً.",
      en: "The verification code has expired. Request a new code.",
    },
    RATE_LIMITED: {
      ar: "تمت محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.",
      en: "Too many attempts. Wait a moment before trying again.",
    },
    ACCOUNT_INACTIVE: {
      ar: "الحساب غير نشط. تواصل مع الدعم لإعادة تفعيله.",
      en: "This account is inactive. Contact support to reactivate it.",
    },
    USER_NOT_FOUND: {
      ar: "لم نتمكن من العثور على هذا الحساب.",
      en: "We could not find this account.",
    },
  };
  return messages[code || ""]?.[language] || apiErrorMessage(cause, fallback);
}

const authSlides = [
  {
    key: "connect",
    label: "Connect",
    image: "/auth-carousel/connect.png",
    ar: {
      title: "وصلة تجمع لك الفرص في مكان واحد",
      body: "اكتشف الشركات والفرص المناسبة، وابنِ علاقات أعمال جديدة من خلال منصة واحدة تربطك بالسوق.",
    },
    en: {
      title: "Bring every opportunity into one place",
      body: "Discover the right companies and opportunities, then build new business relationships through one platform connected to your market.",
    },
  },
  {
    key: "qualify",
    label: "Qualify",
    image: "/auth-carousel/qualify.png",
    ar: {
      title: "من الفرصة إلى التواصل بخطوات أوضح",
      body: "تساعدك وصلة على الوصول إلى الجهات المناسبة وفهم احتياجها قبل بدء التواصل، لتجعل كل تواصل أكثر قيمة.",
    },
    en: {
      title: "From opportunity to outreach, with clearer steps",
      body: "Wasla helps you reach the right organizations and understand their needs before outreach, so every conversation carries more value.",
    },
  },
  {
    key: "grow",
    label: "Grow",
    image: "/auth-carousel/grow.png",
    ar: {
      title: "حوّل علاقاتك إلى فرص نمو",
      body: "وسّع شبكة أعمالك، اكتشف فرصاً جديدة، واتخذ قرارات أفضل تساعدك على تنمية أعمالك.",
    },
    en: {
      title: "Turn relationships into growth opportunities",
      body: "Expand your business network, uncover new opportunities, and make better decisions that help your business grow.",
    },
  },
] as const;

function launchConfetti() {
  const defaults = {
    spread: 72,
    startVelocity: 34,
    ticks: 130,
    gravity: 0.9,
    colors: ["#050505", "#087a4f", "#ffffff", "#b8b8b8"],
  };
  void confetti({
    ...defaults,
    particleCount: 85,
    origin: { x: 0.25, y: 0.55 },
  });
  void confetti({
    ...defaults,
    particleCount: 85,
    origin: { x: 0.75, y: 0.55 },
  });
}

export function AuthDialog({
  initialMode = "signup",
  open,
  user,
  onClose,
  onAuthenticated,
  onCelebration,
  onReady,
}: AuthDialogProps) {
  const { direction, language, t } = useLanguage();
  const [mode, setMode] = useState<Mode>("signup");
  const [step, setStep] = useState<Step>(
    user && !user.verifiedPhone ? "verify" : "account",
  );
  const [form, setForm] = useState({
    name: "",
    business: "",
    phone: "",
    email: "",
    password: "",
  });
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState<string | null>(null);
  const [socialIdentity, setSocialIdentity] = useState<SocialIdentity | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const socialReturnHandled = useRef(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError("");
    setStep(user && !user.verifiedPhone ? "verify" : "account");
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [initialMode, onClose, open, user]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(
      () => setActiveSlide((current) => (current + 1) % authSlides.length),
      4600,
    );
    return () => window.clearInterval(timer);
  }, [open]);

  useEffect(() => {
    if (
      !open ||
      window.location.pathname !== "/auth/social" ||
      socialReturnHandled.current
    )
      return;
    socialReturnHandled.current = true;
    setBusy(true);
    setError("");
    getSocialIdentity()
      .then(async (identity) => {
        setSocialIdentity(identity);
        if (!identity.profile_complete) {
          setStep("social");
          return;
        }
        const account = accountToAuthUser(await getAccount());
        onAuthenticated(account);
        if (account.verifiedPhone) {
          onReady(account);
          onClose();
        } else {
          const verification = await requestPhoneVerification();
          setOtpHint(verification.dev_code ?? null);
          setStep("verify");
        }
      })
      .catch((cause) => {
        setStep("account");
        setError(
          exactAuthError(
            cause,
            language,
            language === "ar"
              ? "تعذر إكمال الدخول الاجتماعي. حاول مرة أخرى."
              : "We could not complete social sign-in. Please try again.",
          ),
        );
      })
      .finally(() => setBusy(false));
  }, [language, onAuthenticated, onClose, onReady, open]);

  if (!open) return null;

  async function sendVerification() {
    const verification = await requestPhoneVerification();
    setOtpHint(verification.dev_code ?? null);
  }

  async function completeSocialProfile() {
    if (!form.business.trim()) {
      setError(
        language === "ar" ? "أدخل اسم الشركة." : "Enter your company name.",
      );
      return;
    }
    if (!validSaudiPhone(form.phone)) {
      setError(
        language === "ar"
          ? "أدخل 9 أرقام لرقم جوال سعودي يبدأ بالرقم 5، من دون الصفر الأول."
          : "Enter exactly 9 digits for a Saudi mobile number, starting with 5 and without the first 0.",
      );
      return;
    }
    if (!consentAccepted) {
      setError(
        language === "ar"
          ? "اقرأ سياسة الخصوصية والصلاحيات ثم وافق للمتابعة."
          : "Read and accept the Privacy Policy and Permissions to continue.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await completeSocialAccount({
        business: form.business.trim(),
        phone: form.phone.trim(),
        locale: language === "ar" ? "ar-SA" : "en",
        privacy_accepted: true,
        permissions_accepted: true,
        consent_version: consentVersion,
      });
      const account = accountToAuthUser(await getAccount());
      onAuthenticated(account);
      await sendVerification();
      setStep("verify");
      launchConfetti();
      onCelebration(
        language === "ar"
          ? {
              title: `حياك الله يا ${account.name.split(" ")[0]}`,
              body: "تم ربط حسابك وإنشاء مساحة وصلة. وثّق الجوال لتفعيل 30 عميلاً مجاناً ورصيد 100 ر.س.",
            }
          : {
              title: `Welcome, ${account.name.split(" ")[0]}`,
              body: "Your workspace is ready. Verify your phone to unlock 30 free leads and 100 SAR credit.",
            },
      );
    } catch (cause) {
      setError(
        exactAuthError(
          cause,
          language,
          language === "ar"
            ? "تعذر إنشاء مساحة الحساب الاجتماعي."
            : "We could not create your social workspace.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function createAccount() {
    if (form.name.trim().length < 2)
      return setError(
        language === "ar" ? "أدخل اسمك الكامل." : "Enter your full name.",
      );
    if (form.business.trim().length < 2)
      return setError(
        language === "ar" ? "أدخل اسم شركتك." : "Enter your company name.",
      );
    if (!validSaudiPhone(form.phone))
      return setError(
        language === "ar"
          ? "أدخل 9 أرقام لرقم جوال سعودي يبدأ بالرقم 5، من دون الصفر الأول."
          : "Enter exactly 9 digits for a Saudi mobile number, starting with 5 and without the first 0.",
      );
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return setError(
        language === "ar"
          ? "أدخل بريداً إلكترونياً صالحاً."
          : "Enter a valid email address.",
      );
    if (form.password.length < 10)
      return setError(
        language === "ar"
          ? "كلمة المرور يجب أن تتكون من 10 أحرف على الأقل."
          : "Your password must contain at least 10 characters.",
      );
    if (!hasDirectus) {
      setError(
        language === "ar"
          ? "Directus غير متصل. راجع VITE_DIRECTUS_URL في ملف البيئة."
          : "Directus is not connected. Check VITE_DIRECTUS_URL in your environment file.",
      );
      return;
    }
    if (!consentAccepted) {
      setError(
        language === "ar"
          ? "اقرأ سياسة الخصوصية والصلاحيات ثم وافق للمتابعة."
          : "Read and accept the Privacy Policy and Permissions to continue.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await registerAccount({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        business: form.business.trim(),
        phone: form.phone.trim(),
        privacy_accepted: true,
        permissions_accepted: true,
        consent_version: consentVersion,
      });
      await loginAccount(form.email.trim(), form.password);
      const account = accountToAuthUser(await getAccount());
      onAuthenticated(account);
      await sendVerification();
      setStep("verify");
      launchConfetti();
      onCelebration(
        language === "ar"
          ? {
              title: `حياك الله يا ${account.name.split(" ")[0]}`,
              body: "تم إنشاء مساحة وصلة بنجاح. بقي توثيق الجوال لتفعيل 30 عميلاً مجاناً ورصيد 100 ر.س.",
            }
          : {
              title: `Welcome, ${account.name.split(" ")[0]}`,
              body: "Your Wasla workspace is ready. Verify your phone to unlock 30 free leads and 100 SAR credit.",
            },
      );
    } catch (cause) {
      setError(
        exactAuthError(
          cause,
          language,
          language === "ar"
            ? "تعذر إنشاء الحساب. راجع البيانات وحاول مرة أخرى."
            : "We could not create the account. Check your details and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function signIn() {
    if (!form.email.trim() || !form.password) {
      setError(
        language === "ar"
          ? "أدخل البريد الإلكتروني وكلمة المرور."
          : "Enter your email and password.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await loginAccount(form.email.trim(), form.password);
      const account = accountToAuthUser(await getAccount());
      onAuthenticated(account);
      if (account.verifiedPhone) {
        onReady(account);
        onClose();
      } else {
        await sendVerification();
        setStep("verify");
      }
    } catch (cause) {
      setError(
        exactAuthError(
          cause,
          language,
          language === "ar"
            ? "تعذر تسجيل الدخول بسبب خطأ في خدمة المصادقة."
            : "Sign-in failed because the authentication service could not complete the request.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone() {
    if (!otp.trim()) {
      setError(
        language === "ar"
          ? "أدخل رمز التحقق المرسل إلى جوالك."
          : "Enter the verification code sent to your phone.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await confirmPhoneVerification(otp.trim());
      const account = accountToAuthUser(await getAccount());
      onAuthenticated(account);
      window.localStorage.setItem(`wasla:onboarding:${account.id}`, "pending");
      launchConfetti();
      onCelebration(
        language === "ar"
          ? {
              title: "عرضك المجاني جاهز",
              body: "تم توثيق الجوال وتفعيل 30 عميلاً مجاناً ورصيد بداية بقيمة 100 ر.س.",
            }
          : {
              title: "Your welcome offer is ready",
              body: "Phone verified. Your 30 free leads and 100 SAR starter credit are active.",
            },
      );
      onReady(account);
      onClose();
    } catch (cause) {
      setError(
        exactAuthError(
          cause,
          language,
          language === "ar"
            ? "تعذر التحقق من الرمز."
            : "The verification code could not be verified.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`auth-dialog${language === "en" ? " is-english" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
      dir={direction}
    >
      <button
        className="auth-dialog__backdrop"
        onClick={onClose}
        aria-label={language === "ar" ? "إغلاق التسجيل" : "Close registration"}
      />
      <section className="auth-dialog__window">
        <aside className="auth-dialog__story">
          <div className="auth-dialog__story-head">
            <WaslaBrand variant="horizontal" />
            <div className="auth-dialog__tools">
              <LanguageToggle />
              <button
                className="auth-dialog__close"
                onClick={onClose}
                aria-label={language === "ar" ? "إغلاق" : "Close"}
              >
                <X size={19} />
              </button>
            </div>
          </div>
          <AuthStoryCarousel
            activeSlide={activeSlide}
            language={language}
            onSlideChange={setActiveSlide}
          />
        </aside>
        <div className="auth-dialog__mobile-tools">
          <LanguageToggle />
          <button
            className="auth-dialog__close"
            onClick={onClose}
            aria-label={language === "ar" ? "إغلاق" : "Close"}
          >
            <X size={19} />
          </button>
        </div>

        <div className="auth-dialog__form">
          <div className="auth-dialog__progress">
            <span className="is-done">
              <Check size={14} /> {language === "ar" ? "البداية" : "Start"}
            </span>
            <span className={step === "verify" ? "is-done" : "is-active"}>
              {step === "verify" ? <Check size={14} /> : <UserPlus size={14} />}{" "}
              {language === "ar" ? "الحساب" : "Account"}
            </span>
            <span className={step === "verify" ? "is-active" : ""}>
              <Smartphone size={14} />{" "}
              {language === "ar" ? "التوثيق" : "Verify"}
            </span>
          </div>

          {step === "account" ? (
            <>
              <div className="auth-dialog__heading">
                <span>
                  {mode === "signup" ? t("auth.begin") : t("auth.welcome")}
                </span>
                <h1 id="auth-dialog-title">
                  {mode === "signup"
                    ? t("auth.createTitle")
                    : t("auth.loginTitle")}
                </h1>
              </div>
              <div className="auth-dialog__divider"></div>
              <div
                className="auth-dialog__modes"
                role="tablist"
                aria-label={
                  language === "ar" ? "طريقة الدخول" : "Authentication method"
                }
              >
                <button
                  className={mode === "signup" ? "active" : ""}
                  onClick={() => {
                    setMode("signup");
                    setError("");
                  }}
                >
                  {t("auth.signup")}
                </button>
                <button
                  className={mode === "login" ? "active" : ""}
                  onClick={() => {
                    setMode("login");
                    setError("");
                  }}
                >
                  {t("auth.signin")}
                </button>
              </div>
              <div className="auth-dialog__fields">
                {mode === "signup" && (
                  <>
                    <div className="auth-dialog__field-row">
                      <Field label={t("auth.name")}>
                        <input
                          autoFocus
                          value={form.name}
                          onChange={(event) =>
                            setForm({ ...form, name: event.target.value })
                          }
                          placeholder={
                            language === "ar"
                              ? "عبدالعزيز العتيبي"
                              : "Abdulaziz Alotaibi"
                          }
                          autoComplete="name"
                        />
                      </Field>
                      <Field label={t("auth.company")}>
                        <input
                          value={form.business}
                          onChange={(event) =>
                            setForm({ ...form, business: event.target.value })
                          }
                          placeholder={
                            language === "ar" ? "عيادة النمو" : "Growth Clinic"
                          }
                          autoComplete="organization"
                        />
                      </Field>
                    </div>
                    <Field label={t("auth.phone")}>
                      <div className="auth-dialog__saudi-phone" dir="ltr">
                        <span>+966</span>
                        <input
                          value={form.phone}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              phone: saudiPhoneInput(event.target.value),
                            })
                          }
                          placeholder="5XXXXXXXX"
                          maxLength={9}
                          pattern="5[0-9]{8}"
                          autoComplete="tel-national"
                          inputMode="numeric"
                        />
                      </div>
                    </Field>
                  </>
                )}
                <Field label={t("auth.email")}>
                  <input
                    autoFocus={mode === "login"}
                    value={form.email}
                    onChange={(event) =>
                      setForm({ ...form, email: event.target.value })
                    }
                    placeholder="name@company.sa"
                    autoComplete="email"
                    inputMode="email"
                    dir="ltr"
                  />
                </Field>
                <Field label={t("auth.password")}>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(event) =>
                      setForm({ ...form, password: event.target.value })
                    }
                    placeholder={
                      mode === "signup"
                        ? language === "ar"
                          ? "10 أحرف على الأقل"
                          : "At least 10 characters"
                        : t("auth.password")
                    }
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    dir="ltr"
                    onKeyDown={(event) =>
                      event.key === "Enter" &&
                      (mode === "signup" ? createAccount() : signIn())
                    }
                  />
                </Field>
                {mode === "signup" && (
                  <ConsentCheck
                    checked={consentAccepted}
                    onChange={setConsentAccepted}
                    language={language}
                  />
                )}
              </div>
              {error && <AuthError message={error} language={language} />}
              <button
                className="auth-dialog__submit"
                onClick={mode === "signup" ? createAccount : signIn}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="is-spinning" size={18} />
                ) : mode === "signup" ? (
                  <UserPlus size={18} />
                ) : (
                  <LockKeyhole size={18} />
                )}
                {mode === "signup"
                  ? t("auth.createButton")
                  : t("auth.loginButton")}
                {!busy &&
                  (language === "ar" ? (
                    <ArrowLeft size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  ))}
              </button>
              {mode === "login" && (
                <p className="auth-dialog__terms">
                  {language === "ar"
                    ? "جلسة الدخول محمية ومقيدة بمساحة شركتك."
                    : "Your session is protected and restricted to your company workspace."}
                </p>
              )}
            </>
          ) : step === "social" ? (
            <div className="auth-dialog__social-complete">
              <div className="auth-dialog__heading">
                <span>
                  {socialIdentity?.provider === "google"
                    ? "Google"
                    : socialIdentity?.provider === "microsoft"
                      ? "Microsoft"
                      : t("auth.begin")}
                </span>
                <h1 id="auth-dialog-title">{t("auth.socialFinish")}</h1>
                <p>{t("auth.socialBody")}</p>
              </div>
              {socialIdentity && (
                <div className="auth-dialog__identity">
                  <div>{socialIdentity.name.slice(0, 1).toUpperCase()}</div>
                  <span>
                    <strong>{socialIdentity.name}</strong>
                    <small dir="ltr">{socialIdentity.email}</small>
                  </span>
                  <BadgeCheck size={18} />
                </div>
              )}
              <div className="auth-dialog__fields">
                <Field label={t("auth.company")}>
                  <input
                    autoFocus
                    value={form.business}
                    onChange={(event) =>
                      setForm({ ...form, business: event.target.value })
                    }
                    placeholder={
                      language === "ar" ? "عيادة النمو" : "Growth Clinic"
                    }
                    autoComplete="organization"
                  />
                </Field>
                <Field label={t("auth.phone")}>
                  <div className="auth-dialog__saudi-phone" dir="ltr">
                    <span>+966</span>
                    <input
                      value={form.phone}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          phone: saudiPhoneInput(event.target.value),
                        })
                      }
                      placeholder="5XXXXXXXX"
                      maxLength={9}
                      pattern="5[0-9]{8}"
                      autoComplete="tel-national"
                      inputMode="numeric"
                      onKeyDown={(event) =>
                        event.key === "Enter" && completeSocialProfile()
                      }
                    />
                  </div>
                </Field>
                <ConsentCheck
                  checked={consentAccepted}
                  onChange={setConsentAccepted}
                  language={language}
                />
              </div>
              {error && <AuthError message={error} language={language} />}
              <button
                className="auth-dialog__submit"
                onClick={completeSocialProfile}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="is-spinning" size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {t("auth.socialButton")}
                {!busy &&
                  (language === "ar" ? (
                    <ArrowLeft size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  ))}
              </button>
              <p className="auth-dialog__terms">
                {language === "ar"
                  ? "لن تحصل أي جهة خارجية على بيانات عملائك أو مساحة شركتك."
                  : "No external provider receives access to your leads or company workspace."}
              </p>
            </div>
          ) : (
            <div className="auth-dialog__verify">
              <div className="auth-dialog__phone-icon">
                <Smartphone size={28} />
              </div>
              <div className="auth-dialog__heading">
                <span>{t("auth.lastStep")}</span>
                <h1 id="auth-dialog-title">{t("auth.verifyTitle")}</h1>
                <p>
                  {language === "ar" ? "أرسلنا رمزاً إلى" : "We sent a code to"}{" "}
                  <strong dir="ltr">{user?.phone}</strong>.{" "}
                  {language === "ar"
                    ? "يمنع التحقق الحسابات الوهمية ويحمي جودة شبكة وصلة."
                    : "Verification prevents fake accounts and protects the quality of the Wasla network."}
                </p>
              </div>
              {otpHint && (
                <div className="auth-dialog__dev-code">
                  {language === "ar" ? "رمز التطوير" : "Development code"}:{" "}
                  <strong>{otpHint}</strong>
                </div>
              )}
              <Field label={t("auth.code")}>
                <input
                  autoFocus
                  className="auth-dialog__otp"
                  value={otp}
                  onChange={(event) =>
                    setOtp(event.target.value.replace(/\D/g, ""))
                  }
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  dir="ltr"
                  onKeyDown={(event) => event.key === "Enter" && verifyPhone()}
                />
              </Field>
              {error && <AuthError message={error} language={language} />}
              <button
                className="auth-dialog__submit"
                onClick={verifyPhone}
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="is-spinning" size={18} />
                ) : (
                  <BadgeCheck size={18} />
                )}
                {t("auth.verifyButton")}
              </button>
              <button
                className="auth-dialog__resend"
                onClick={sendVerification}
                disabled={busy}
              >
                {t("auth.resend")}
              </button>
              <div className="auth-dialog__credit">
                <Gift size={18} />
                <div>
                  <strong>
                    {language === "ar"
                      ? "30 عميلاً مجاناً + رصيد 100 ر.س"
                      : "30 free leads + 100 SAR credit"}
                  </strong>
                  <span>
                    {language === "ar"
                      ? "تُفعّل مرة واحدة بعد توثيق الجوال"
                      : "Activated once after phone verification"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="auth-dialog__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function AuthError({
  message,
  language,
}: {
  message: string;
  language: "ar" | "en";
}) {
  return (
    <div className="auth-dialog__error" role="alert">
      <AlertTriangle size={18} />
      <div>
        <strong>
          {language === "ar" ? "تعذر إكمال الطلب" : "Authentication failed"}
        </strong>
        <span>{message}</span>
      </div>
    </div>
  );
}

function ConsentCheck({
  checked,
  onChange,
  language,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  language: "ar" | "en";
}) {
  return (
    <label className="auth-dialog__consent">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="auth-dialog__consent-box" aria-hidden="true">
        {checked && <Check size={13} strokeWidth={3} />}
      </span>
      <span>
        {language === "ar" ? "قرأت وأوافق على " : "I have read and accept the "}
        <a href="/privacy" target="_blank" rel="noreferrer">
          {language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
        </a>
        {language === "ar" ? " و" : " and "}
        <a href="/permissions" target="_blank" rel="noreferrer">
          {language === "ar" ? "الصلاحيات" : "Permissions"}
        </a>
        .
      </span>
    </label>
  );
}

function AuthStoryCarousel({
  activeSlide,
  language,
  onSlideChange,
}: {
  activeSlide: number;
  language: "ar" | "en";
  onSlideChange: (index: number) => void;
}) {
  const active = authSlides[activeSlide];
  const copy = active[language];
  return (
    <div
      className="auth-carousel"
      aria-roledescription="carousel"
      aria-label={language === "ar" ? "مقدمة وصلة" : "Wasla introduction"}
    >
      <div className="auth-carousel__frame">
        {authSlides.map((slide, index) => (
          <img
            key={slide.key}
            className={index === activeSlide ? "is-active" : ""}
            src={slide.image}
            alt=""
            aria-hidden={index !== activeSlide}
          />
        ))}
      </div>
      <div className="auth-carousel__copy" key={active.key}>
        <span>
          {active.label} · {String(activeSlide + 1).padStart(2, "0")}
        </span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="auth-carousel__footer">
        <strong>
          {language === "ar"
            ? "اكتشف → تواصل → انمُ"
            : "Discover → Connect → Grow"}
        </strong>
        <div
          className="auth-carousel__dots"
          role="tablist"
          aria-label={
            language === "ar" ? "شرائح التعريف" : "Introduction slides"
          }
        >
          {authSlides.map((slide, index) => (
            <button
              key={slide.key}
              className={index === activeSlide ? "is-active" : ""}
              onClick={() => onSlideChange(index)}
              role="tab"
              aria-selected={index === activeSlide}
              aria-label={`${slide.label} ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
