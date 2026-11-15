import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export const ThemeLangControls = ({ className = '' }) => {
  const { theme, resolvedTheme, toggleTheme } = useTheme();
  const { lang, toggleLang, t } = useLanguage();

  const getThemeIcon = () => {
    if (theme === 'system') return '💻';
    return resolvedTheme === 'dark' ? '🌙' : '☀️';
  };

  const getThemeText = () => {
    if (theme === 'system') return t('theme.system', 'Hệ thống');
    return resolvedTheme === 'dark' ? t('theme.dark', 'Tối') : t('theme.light', 'Sáng');
  };

  return (
    <div className={`theme-lang-controls ${className}`} role="group" aria-label="Giao diện và ngôn ngữ">
      <button
        type="button"
        className="theme-toggle-btn"
        onClick={toggleTheme}
        title={`${t('theme.toggle_label', 'Chế độ giao diện')}: ${getThemeText()} (${theme})`}
        aria-label={`${t('theme.toggle_label', 'Giao diện')}: ${getThemeText()}`}
      >
        <span aria-hidden="true">{getThemeIcon()}</span>
        <span>{getThemeText()}</span>
      </button>

      <button
        type="button"
        className="lang-toggle-btn"
        onClick={toggleLang}
        title={`${t('lang.label', 'Ngôn ngữ')}: ${lang === 'vi' ? 'Tiếng Việt' : 'English'}`}
        aria-label={`${t('lang.label', 'Ngôn ngữ')}: ${lang === 'vi' ? 'Tiếng Việt' : 'English'}`}
      >
        <span aria-hidden="true">{lang === 'vi' ? '🇻🇳' : '🇬🇧'}</span>
        <span>{lang === 'vi' ? 'VI' : 'EN'}</span>
      </button>
    </div>
  );
};

export default ThemeLangControls;
