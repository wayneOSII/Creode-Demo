import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import en from '../i18n/en.json';
import zhTW from '../i18n/zh-TW.json';

type Lang = 'en' | 'zh-TW';

const translations = { en, 'zh-TW': zhTW } as const;

const LangContext = createContext<{
  lang: Lang;
  t: (key: string) => string;
  toggleLang: () => void;
  setLang: (l: Lang) => void;
}>({
  lang: 'zh-TW',
  t: () => '',
  toggleLang: () => {},
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Read lang from URL path
  const urlLang = location.pathname.split('/')[1] as Lang;
  const validLang = urlLang === 'en' || urlLang === 'zh-TW' ? urlLang : null;

  const [lang, setLang] = useState<Lang>(
    () => validLang || (localStorage.getItem('creode_lang') as Lang) || 'zh-TW'
  );

  // Sync URL when lang changes
  useEffect(() => {
    if (validLang && validLang !== lang) {
      setLang(validLang);
      localStorage.setItem('creode_lang', validLang);
      return;
    }
    if (!validLang) {
      const saved = localStorage.getItem('creode_lang') as Lang;
      navigate(`/${saved || 'zh-TW'}${location.pathname}`, { replace: true });
    }
  }, [validLang]);

  const setLangAndRedirect = (l: Lang) => {
    setLang(l);
    localStorage.setItem('creode_lang', l);
    const segments = location.pathname.split('/').slice(2);
    navigate(`/${l}/${segments.join('/')}`, { replace: true });
  };

  const toggleLang = () => {
    setLang((prev) => {
      const next: Lang = prev === 'zh-TW' ? 'en' : 'zh-TW';
      localStorage.setItem('creode_lang', next);
      return next;
    });
  };

  const t = (key: string): string => {
    const keys = key.split('.');
    let value: unknown = translations[lang];
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    return typeof value === 'string' ? value : key;
  };

  return (
    <LangContext.Provider value={{ lang, t, toggleLang: () => setLangAndRedirect(lang === 'zh-TW' ? 'en' : 'zh-TW'), setLang: setLangAndRedirect }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
