// Тема до первой отрисовки: без инлайна, чтобы работала строгая CSP.
try {
  var stored = localStorage.getItem('sb.theme')
  var theme = stored || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = theme
} catch (e) {}
