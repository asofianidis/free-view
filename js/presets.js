export const FONTS = {
  system: { name: 'System default', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  segoe: { name: 'Segoe UI', css: '"Segoe UI", system-ui, sans-serif' },
  helvetica: { name: 'Helvetica / Arial', css: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  verdana: { name: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  trebuchet: { name: 'Trebuchet', css: '"Trebuchet MS", sans-serif' },
  rounded: { name: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, sans-serif' },
  georgia: { name: 'Georgia (serif)', css: 'Georgia, "Times New Roman", serif' },
  mono: { name: 'Monospace', css: 'ui-monospace, "Cascadia Code", Consolas, "Courier New", monospace' },
};

export function fontStack(settings) {
  const base = (FONTS[settings.fontFamily] || FONTS.system).css;
  return settings.googleFont ? `"${settings.googleFont.replace(/"/g, '')}", ${base}` : base;
}

export function googleFontHref(family) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.trim()).replace(/%20/g, '+')}:wght@300;400;500;600;700&display=swap`;
}

export const GRADIENTS = [
  'linear-gradient(135deg, #1e2a44 0%, #3a1f4a 100%)',
  'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  'linear-gradient(135deg, #232526 0%, #414345 100%)',
  'linear-gradient(135deg, #41295a 0%, #2f0743 100%)',
  'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
  'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
  'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
  'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
  'linear-gradient(135deg, #e0eafc 0%, #cfdef3 100%)',
  'linear-gradient(160deg, #0b0b0f 0%, #1a1a2e 60%, #16213e 100%)',
  'radial-gradient(circle at 20% 20%, #3a6186 0%, #89253e 100%)',
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
  'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
  'linear-gradient(135deg, #000428 0%, #004e92 100%)',
];

// One-click theme bundles.
export const THEMES = [
  { name: 'Midnight', theme: 'dark', accent: '#4f8cff', bgType: 'gradient', bgGradient: GRADIENTS[0], bgDim: 0.15, textColor: '' },
  { name: 'Ocean', theme: 'dark', accent: '#2ec4b6', bgType: 'gradient', bgGradient: GRADIENTS[1], bgDim: 0.1, textColor: '' },
  { name: 'Graphite', theme: 'dark', accent: '#9aa3b5', bgType: 'gradient', bgGradient: GRADIENTS[2], bgDim: 0, textColor: '' },
  { name: 'Aurora', theme: 'dark', accent: '#38ef7d', bgType: 'gradient', bgGradient: GRADIENTS[13], bgDim: 0.25, textColor: '#ffffff' },
  { name: 'Sunset', theme: 'dark', accent: '#ff6a00', bgType: 'gradient', bgGradient: GRADIENTS[5], bgDim: 0.2, textColor: '#ffffff' },
  { name: 'Lavender', theme: 'light', accent: '#7b5cd6', bgType: 'gradient', bgGradient: GRADIENTS[7], bgDim: 0, textColor: '#2a2140' },
  { name: 'Cloud', theme: 'light', accent: '#3b6fd8', bgType: 'gradient', bgGradient: GRADIENTS[10], bgDim: 0, textColor: '#1c2130' },
  { name: 'Paper', theme: 'light', accent: '#d9480f', bgType: 'color', bgColor: '#f4f1ea', bgDim: 0, textColor: '#2b2b2b' },
  { name: 'Deep Space', theme: 'dark', accent: '#a78bfa', bgType: 'gradient', bgGradient: GRADIENTS[11], bgDim: 0, textColor: '' },
  { name: 'Photo of the day', theme: 'dark', accent: '#4f8cff', bgType: 'daily', bgDim: 0.3, textColor: '#ffffff' },
];

export const BROWSER_PAGES = [
  { title: 'Downloads', url: 'chrome://downloads' },
  { title: 'Bookmark manager', url: 'chrome://bookmarks' },
  { title: 'History', url: 'chrome://history' },
  { title: 'Extensions', url: 'chrome://extensions' },
  { title: 'Settings', url: 'chrome://settings' },
  { title: 'Passwords', url: 'chrome://password-manager' },
  { title: 'Apps', url: 'chrome://apps' },
  { title: 'Clear browsing data', url: 'chrome://settings/clearBrowserData' },
];
