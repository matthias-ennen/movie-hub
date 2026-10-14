import { createHash } from 'node:crypto'

const script = `const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);const button=document.querySelector('button'),status=document.querySelector('[role=status]');let purpose;try{const part=token.split('.')[0].replace(/-/g,'+').replace(/_/g,'/');purpose=JSON.parse(atob(part)).purpose}catch{}button.textContent=purpose==='unsubscribe'?'E-Mail-Mitteilungen ausschalten':'E-Mail-Adresse bestätigen';button.disabled=!token;button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Wird verarbeitet …';try{const response=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),credentials:'omit'});const result=await response.json();if(!response.ok)throw Error();status.textContent=result.status==='confirmed'?'Deine Adresse ist bestätigt. Neue Mitteilungen für dieses Profil erhältst du auch per E-Mail.':'E-Mail-Mitteilungen für dieses Profil sind ausgeschaltet.';button.hidden=true}catch{status.textContent='Der Link konnte nicht verarbeitet werden. Bitte versuche es erneut oder speichere deine E-Mail-Einstellungen in MovieHub erneut.';button.disabled=false}});`
const css = 'body{margin:0;background:#edf1f7;color:#1d293d;font:17px/1.6 system-ui,sans-serif}main{max-width:480px;margin:10vh auto;padding:32px;background:white;border-radius:18px}h1{font-size:28px}button{background:#25477a;color:white;border:0;border-radius:9px;font:inherit;padding:14px 20px;cursor:pointer}button:focus-visible{outline:3px solid #397fee;outline-offset:4px}button:disabled{opacity:.6}small{color:#58667a}@media(max-width:550px){main{margin:24px 12px;padding:24px}}'
const hash = (value) => createHash('sha256').update(value).digest('base64')
export const emailActionPage = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>MovieHub · E-Mail-Mitteilungen</title><style>${css}</style></head><body><main><small>MOVIE HUB</small><h1>Deine E-Mail-Mitteilungen</h1><p>Mit dem folgenden Button bestätigst du die gewünschte Änderung für dein Profil.</p><button type="button">Weiter</button><p role="status" aria-live="polite"></p><noscript>Bitte JavaScript aktivieren, um den Link zu verwenden.</noscript></main><script>${script}</script></body></html>`

export function createEmailActionHandler(service) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.set('Referrer-Policy', 'no-referrer')
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Content-Security-Policy', `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(css)}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`)
    // GET is always inert. Link scanners cannot confirm an address/unsubscribe.
    // Token travels in the fragment, never the URL query or access log.
    if (req.method === 'GET' || req.method === 'HEAD') return res.status(200).type('html').send(emailActionPage)
    if (req.method !== 'POST') return res.status(405).json({ error: 'method-not-allowed' })
    if (!service.enabled) return res.status(503).json({ error: 'mail-unavailable' })
    if (!req.is('application/json') || typeof req.body?.token !== 'string'
      || req.body.token.length > 1800 || Object.keys(req.body).length !== 1) return res.status(400).json({ error: 'invalid-link' })
    try { return res.status(200).json({ status: await service.applyToken(req.body.token) }) }
    catch { return res.status(400).json({ error: 'invalid-or-expired-link' }) }
  }
}
