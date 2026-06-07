import { useState, useRef, type FormEvent } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLang } from '@/hooks/useLang';
import { useNav } from '@/hooks/useNav';
import {
  Loader2,
  Mail,
  Lock,
  ArrowRight,
  Shield,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';
import toast from 'react-hot-toast';

const PRIVACY_ZH = `隱私權政策

最後更新日期：2024 年 1 月

1. 資料收集
我們僅收集您提供的電子郵件地址與帳號資訊，用於帳號管理與服務提供。

2. 資料使用
您的資料僅用於 Creode 服務的運作，包括 AI 內容生成、專案儲存與同步。我們不會將您的資料出售或分享給第三方。

3. AI 資料處理
您透過本平台生成的內容（任務、節點、Prompt）會傳送至 AI 服務提供商（如 OpenRouter）進行處理。請勿輸入敏感個人資訊。

4. 資料儲存
您的資料儲存於 Supabase 雲端資料庫，採用業界標準加密技術保護。

5. 您的權利
您可隨時要求刪除帳號及所有相關資料。

6. Cookie 政策
我們使用必要的 Cookie 來維持登入狀態。

7. 服務條款
使用本服務即表示您同意上述條款。`;

const PRIVACY_EN = `Privacy Policy

Last updated: January 2024

1. Data Collection
We only collect your email address and account information for account management and service provision.

2. Data Usage
Your data is used solely for the operation of Creode services, including AI content generation, project storage, and synchronization. We do not sell or share your data with third parties.

3. AI Data Processing
Content you generate through this platform (tasks, nodes, prompts) is sent to AI service providers (such as OpenRouter) for processing. Please do not enter sensitive personal information.

4. Data Storage
Your data is stored in Supabase cloud database, protected with industry-standard encryption.

5. Your Rights
You may request deletion of your account and all associated data at any time.

6. Cookie Policy
We use necessary cookies to maintain login sessions.

7. Terms of Service
By using this service, you agree to the above terms.`;

const AUTH_ERROR_MAP: Record<string, { zh: string; en: string }> = {
  'Invalid login credentials': { zh: '帳號或密碼錯誤', en: 'Invalid email or password' },
  'Email not confirmed': { zh: 'Email 尚未驗證，請查看信箱', en: 'Email not confirmed. Please check your inbox' },
  'User already registered': { zh: '此 Email 已註冊', en: 'This email is already registered' },
  'Password should be at least 6 characters': { zh: '密碼長度至少 6 字元', en: 'Password must be at least 6 characters' },
  'User not found': { zh: '找不到此帳號', en: 'Account not found' },
  'Invalid token': { zh: '驗證已過期，請重新登入', en: 'Session expired. Please sign in again' },
  'Forbidden': { zh: '權限不足', en: 'Access denied' },
  'Database error': { zh: '伺服器錯誤，請稍後再試', en: 'Server error. Please try again later' },
  'Request failed': { zh: '連線失敗，請檢查網路', en: 'Connection failed. Check your network' },
};

function getFriendlyError(raw: string): string {
  for (const [key, msgs] of Object.entries(AUTH_ERROR_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) {
      const lang = localStorage.getItem('creode_lang') || 'zh-TW';
      return lang === 'en' ? msgs.en : msgs.zh;
    }
  }
  return raw;
}

export default function Login() {
  const { signIn, signUp, user } = useAuth();
  const { t, lang } = useLang();
  const { go } = useNav();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacyScrolled, setPrivacyScrolled] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [shakeKey, setShakeKey] = useState(0);
  const privacyRef = useRef<HTMLDivElement>(null);

  if (user) {
    go('/dashboard', { replace: true });
    return null;
  }

  const handleScroll = () => {
    const el = privacyRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 10) {
      setPrivacyScrolled(true);
    }
  };

  const getStrength = (p: string): { level: number; label: string; color: string } => {
    let score = 0;
    if (p.length >= 6) score++;
    if (p.length >= 10) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    const levels = [
      { level: 0, label: 'tooShort', color: 'bg-red-500' },
      { level: 1, label: 'weak', color: 'bg-red-500' },
      { level: 2, label: 'fair', color: 'bg-yellow-500' },
      { level: 3, label: 'good', color: 'bg-blue-500' },
      { level: 4, label: 'strong', color: 'bg-green-500' },
    ];
    return levels[Math.min(score, 4)];
  };

  const strength = getStrength(password);
  const passwordMatch = !confirmPassword || password === confirmPassword;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = t('auth.emailRequired');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = t('auth.emailInvalid');
    if (!password) errs.password = t('auth.passwordRequired');
    else if (password.length < 6) errs.password = t('auth.passwordMinLength');
    if (isSignUp) {
      if (!confirmPassword) errs.confirmPassword = t('auth.confirmRequired');
      else if (password !== confirmPassword) errs.confirmPassword = t('auth.passwordMismatch');
      if (!agreePrivacy) errs.privacy = t('auth.privacyRequired');
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        toast.success(t('auth.signUpSuccess'));
      } else {
        await signIn(email, password);
        toast.success(t('auth.signInSuccess'));
        go('/dashboard');
      }
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const friendly = getFriendlyError(raw);
      toast.error(friendly);
      setErrors((p) => ({ ...p, form: friendly }));
      setShakeKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-canvas-bg p-4 relative overflow-hidden">
      {/* Back button */}
      <button
        onClick={() => go(-1)}
        className="absolute top-4 left-4 btn-ghost p-2 z-20"
        title={t('nav.back')}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>

      {/* Tech background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/3 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {/* Logo area */}
        <div className="text-center mb-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
            <div className="w-3 h-3 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" style={{ animationDelay: '0.6s' }} />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Creode
          </h1>
          <p className="text-gray-500 text-sm mt-1">AI-Powered Canvas Creation</p>
        </div>

        {/* Card */}
        <div key={shakeKey} className={`glass-surface p-8 space-y-5 border-indigo-500/10 ${errors.form ? 'animate-shake' : ''} animate-scale-in`}
          style={{ animationDelay: '0.2s' }}>
          {errors.form && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2.5 text-sm text-red-400 text-center">
              {errors.form}
            </div>
          )}
          <h2 className="text-xl font-semibold text-center">
            {isSignUp ? t('auth.createAccount') : t('auth.welcomeBack')}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: '' })); }}
                  className={`input-field pl-10 ${errors.email ? 'border-red-500 focus:border-red-500 animate-shake' : ''}`}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && <p className="text-xs text-red-400 mt-1 ml-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5 ml-1">{t('auth.password')}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: '' })); }}
                  className={`input-field pl-10 pr-10 ${errors.password ? 'border-red-500 focus:border-red-500 animate-shake' : ''}`}
                  minLength={6}
                  placeholder={isSignUp ? t('auth.passwordMinLength') : t('auth.passwordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-400"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400 mt-1 ml-1">{errors.password}</p>}
            </div>

            {/* Password strength (sign up only) */}
            {isSignUp && password.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= strength.level ? strength.color : 'bg-canvas-border'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500">{t(`auth.passwordStrength.${strength.label}`)}</p>
              </div>
            )}

            {/* Confirm password (sign up only) */}
            {isSignUp && (
              <div>
                <label className="block text-xs text-gray-500 mb-1.5 ml-1">{t('auth.confirmPassword')}</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`input-field pl-10 ${confirmPassword && !passwordMatch ? 'border-red-500 focus:border-red-500 animate-shake' : ''}`}
                    placeholder={t('auth.confirmPlaceholder')}
                  />
                </div>
                {confirmPassword && !passwordMatch && (
                  <p className="text-xs text-red-400 mt-1 ml-1">{t('auth.passwordMismatch')}</p>
                )}
              </div>
            )}

            {/* Privacy checkbox (sign up only) */}
            {isSignUp && (
              <div className="flex items-start gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (agreePrivacy) {
                      setAgreePrivacy(false);
                    } else {
                      setShowPrivacy(true);
                      setPrivacyScrolled(false);
                    }
                  }}
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    agreePrivacy
                      ? 'bg-indigo-500 border-indigo-500'
                      : 'border-gray-600 hover:border-gray-500'
                  }`}
                >
                  {agreePrivacy && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 6l3 3 5-6" />
                    </svg>
                  )}
                </button>
                <span className="text-xs text-gray-500 leading-relaxed">
                  {t('auth.agreePrivacy')}{' '}
                  <button
                    type="button"
                    onClick={() => { setShowPrivacy(true); setPrivacyScrolled(false); }}
                    className="text-indigo-400 hover:text-indigo-300 underline"
                  >
                    {t('auth.privacyPolicy')}
                  </button>
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (isSignUp && !agreePrivacy)}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
              {submitting ? t('auth.processing') : isSignUp ? t('auth.signUp') : t('auth.signIn')}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500">
            {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <button
              type="button"
              onClick={() => { setIsSignUp(!isSignUp); setAgreePrivacy(false); setErrors({}); setConfirmPassword(''); }}
              className="text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {isSignUp ? t('auth.signIn') : t('auth.signUp')}
            </button>
          </p>
        </div>
      </div>

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-surface w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-canvas-border">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-semibold">{t('privacy.title')}</h2>
              </div>
              <button onClick={() => setShowPrivacy(false)} className="btn-ghost p-1">✕</button>
            </div>
            <div
              ref={privacyRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-5 text-sm text-gray-400 leading-relaxed whitespace-pre-line"
            >
              {lang === 'en' ? PRIVACY_EN : PRIVACY_ZH}
            </div>
            <div className="p-5 border-t border-canvas-border flex items-center justify-between">
              <p className="text-xs text-gray-500">
                {privacyScrolled ? t('auth.readComplete') : t('auth.scrollToBottom')}
              </p>
              <button
                onClick={() => {
                  if (privacyScrolled) {
                    setAgreePrivacy(true);
                    setShowPrivacy(false);
                  }
                }}
                disabled={!privacyScrolled}
                className="btn-primary text-sm disabled:opacity-30"
              >
                {t('auth.iAgree')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
