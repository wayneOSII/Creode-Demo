import { useNavigate, type NavigateOptions } from 'react-router-dom';
import { useLang } from './useLang';

export function useNav() {
  const navigate = useNavigate();
  const { lang } = useLang();

  const go = (path: string | number, options?: NavigateOptions) => {
    if (typeof path === 'number') {
      navigate(path);
    } else {
      navigate(`/${lang}${path}`, options);
    }
  };

  return { go, lang };
}
