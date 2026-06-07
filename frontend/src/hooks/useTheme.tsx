import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const ThemeContext = createContext<{
  lightMode: boolean;
  toggleTheme: () => void;
}>({ lightMode: false, toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [lightMode, setLightMode] = useState(() => {
    return localStorage.getItem('creode_light') === '1';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('light', lightMode);
  }, [lightMode]);

  const toggleTheme = () => {
    setLightMode((prev) => {
      const next = !prev;
      localStorage.setItem('creode_light', next ? '1' : '0');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ lightMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
