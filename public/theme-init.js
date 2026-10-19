// Apply a saved light/dark choice before the first paint (no flash); storage may be blocked.
// This is a separate file, not an inline script, so the Content-Security-Policy can forbid inline scripts.
try {
  var t = localStorage.getItem('crm-theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch (e) {}
