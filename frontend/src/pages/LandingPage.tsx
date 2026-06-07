import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { useLang } from '@/hooks/useLang';
import { useNav } from '@/hooks/useNav';
import {
  Sparkles,
  GitBranch,
  Wand2,
  Layout,
  ArrowRight,
  Loader2,
  Globe,
  HelpCircle,
  LogIn,
  Sun,
  Moon,
  ChevronDown,
  Shield,
} from 'lucide-react';

const PRIVACY_ZH = `隱私權政策

最後更新日期：2024 年 1 月

1. 資料收集
我們僅收集您提供的電子郵件地址與帳號資訊，用於帳號管理與服務提供。

2. 資料使用
您的資料僅用於 Creode 服務的運作，包括 AI 內容生成、專案儲存與同步。我們不會將您的資料出售或分享給第三方。

3. AI 資料處理
您透過本平台生成的內容（任務、節點、Prompt）會傳送至 AI 服務提供商進行處理。請勿輸入敏感個人資訊。

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
Content you generate through this platform (tasks, nodes, prompts) is sent to AI service providers for processing. Please do not enter sensitive personal information.

4. Data Storage
Your data is stored in Supabase cloud database, protected with industry-standard encryption.

5. Your Rights
You may request deletion of your account and all associated data at any time.

6. Cookie Policy
We use necessary cookies to maintain login sessions.

7. Terms of Service
By using this service, you agree to the above terms.`;

const featureKeys = [
  { key: 'feature1', icon: <Sparkles className="w-8 h-8" />, gradient: 'from-indigo-500/20 to-purple-500/20', iconColor: 'text-indigo-400' },
  { key: 'feature2', icon: <GitBranch className="w-8 h-8" />, gradient: 'from-purple-500/20 to-pink-500/20', iconColor: 'text-purple-400' },
  { key: 'feature3', icon: <Wand2 className="w-8 h-8" />, gradient: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-400' },
  { key: 'feature4', icon: <Layout className="w-8 h-8" />, gradient: 'from-emerald-500/20 to-teal-500/20', iconColor: 'text-emerald-400' },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const { lightMode, toggleTheme } = useTheme();
  const { lang, setLang, t } = useLang();
  const { go } = useNav();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas-bg">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-bg">
      {/* Top bar */}
      <header className="top-bar h-16 flex items-center justify-between px-6 backdrop-blur-sm border-b fixed top-0 left-0 right-0 z-30">
        <button
          onClick={() => go('/')}
          className="font-bold text-2xl bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent hover:opacity-80 transition-opacity"
        >
          Creode
        </button>

        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="btn-ghost p-1.5 text-sm" title={lightMode ? t('theme.dark') : t('theme.light')}>
            {lightMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <div className="relative">
            <button onClick={() => setLangMenuOpen(!langMenuOpen)} className="btn-ghost lang-btn flex items-center gap-1 p-1.5 text-sm" title={t('nav.language')}>
              <Globe className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-medium">{lang === 'zh-TW' ? '中文' : 'EN'}</span>
              <ChevronDown className={`w-3 h-3 transition-transform flex-shrink-0 ${langMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {langMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-28 glass-surface p-1 shadow-lg z-40">
                <button
                  onClick={() => { setLang('zh-TW'); setLangMenuOpen(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${lang === 'zh-TW' ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  繁體中文
                </button>
                <button
                  onClick={() => { setLang('en'); setLangMenuOpen(false); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs transition-colors ${lang === 'en' ? 'bg-indigo-500/10 text-indigo-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  English
                </button>
              </div>
            )}
          </div>
          <button className="btn-ghost p-1.5 text-sm" title={t('nav.support')}>
            <HelpCircle className="w-4 h-4" />
          </button>
          {!user && (
            <button
              onClick={() => go('/login')}
              className="btn-ghost flex items-center gap-1.5 text-sm w-[90px] justify-center"
            >
              <LogIn className="w-4 h-4 flex-shrink-0" />
              {t('nav.login')}
            </button>
          )}
          <button
            onClick={() => go(user ? '/dashboard' : '/login')}
            className="btn-primary flex items-center gap-1.5 text-sm w-[90px] justify-center"
          >
            {t('nav.start')}
            <ArrowRight className="w-4 h-4 flex-shrink-0" />
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="flex flex-col items-center justify-center pt-36 pb-16 px-4 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl animate-float" />
          <div className="absolute top-2/3 right-1/4 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
        </div>

        <div className="relative z-10 text-center">
          <div className="animate-fade-in-up mb-6">
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-400 mb-4">
              {t('landing.badge')}
            </span>
          </div>

          <h1 className="text-6xl md:text-7xl font-bold mb-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-amber-400 bg-clip-text text-transparent">
              Creode
            </span>
          </h1>

          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-8 animate-fade-in-up leading-relaxed" style={{ animationDelay: '0.2s' }}>
            {t('landing.subtitle')}
            <br />
            <span className="text-gray-600">{t('landing.subtitle2')}</span>
          </p>

          <div className="animate-fade-in-up flex items-center justify-center gap-2 text-xs text-gray-600" style={{ animationDelay: '0.3s' }}>
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            {t('landing.status')}
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-4 pb-16 stagger-children">
        <div className="text-center mb-12 animate-fade-in">
          <h2 className="text-2xl font-bold text-white mb-2">{t('landing.features')}</h2>
          <p className="text-gray-500 text-sm">{t('landing.featuresDesc')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {featureKeys.map((f, i) => (
            <div
              key={i}
              className="group glass-surface p-6 space-y-4 cursor-default
                         hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5
                         hover:-translate-y-0.5"
            >
              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} 
                              flex items-center justify-center ${f.iconColor}
                              group-hover:scale-110 transition-transform duration-300`}>
                {f.icon}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1.5">{t(`landing.${f.key}Title`)}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{t(`landing.${f.key}Desc`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="site-footer border-t border-canvas-border">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Creode</span>
            <span className="text-xs text-gray-600">© {new Date().getFullYear()}</span>
            <span className="font-bold text-sm bg-gradient-to-r">Made by 洪緯承</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => setShowPrivacy(true)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {t('privacy.title')}
            </button>
            <span className="text-xs text-gray-500">
              {t('footer.contact')}: support@creode.dev
            </span>
          </div>
        </div>
      </footer>

      {/* Privacy Modal */}
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
            <div className="flex-1 overflow-y-auto p-5 text-sm text-gray-400 leading-relaxed whitespace-pre-line">
              {lang === 'en' ? PRIVACY_EN : PRIVACY_ZH}
            </div>
            <div className="p-5 border-t border-canvas-border flex justify-end">
              <button onClick={() => setShowPrivacy(false)} className="btn-primary text-sm">關閉</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
