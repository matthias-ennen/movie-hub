const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const plain = (value, length = 160) => String(value ?? '').replace(/[\r\n\u0000-\u001f\u007f]/g, ' ').trim().slice(0, length)

function frame({ subject, eyebrow, title, paragraphs, button, url, footer, footerUrl }) {
  if (![url, footerUrl].filter(Boolean).every((link) => {
    try { return new URL(link).protocol === 'https:' } catch { return false }
  })) throw new Error('invalid-mail-link')
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#edf1f7;color:#1d293d;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden"><tr><td style="background:#111827;padding:28px;color:#ffffff;font-size:21px;font-weight:bold;letter-spacing:2px">MOVIE <span style="color:#93c5fd">HUB</span></td></tr><tr><td style="padding:30px 28px"><p style="margin:0 0 14px;color:#375c95;font-size:12px;font-weight:bold;letter-spacing:1px">${escape(eyebrow)}</p><h1 style="margin:0 0 22px;font-size:27px;line-height:1.25;overflow-wrap:anywhere">${escape(title)}</h1>${paragraphs.map((p) => `<p style="font-size:16px;line-height:1.6;margin:0 0 16px">${escape(p)}</p>`).join('')}<p style="margin:26px 0 12px"><a href="${escape(url)}" style="display:inline-block;background:#25477a;color:white;padding:14px 22px;border-radius:9px;text-decoration:none;font-weight:bold">${escape(button)}</a></p></td></tr><tr><td style="padding:20px 28px;background:#f7f9fc;font-size:12px;line-height:1.6;color:#58667a">${escape(footer)}${footerUrl ? `<br><a href="${escape(footerUrl)}" style="color:#375c95">E-Mail-Mitteilungen für dieses Profil ausschalten</a>` : ''}</td></tr></table></td></tr></table></body></html>`
  return { subject, html, text: `${eyebrow}\n\n${title}\n\n${paragraphs.join('\n\n')}\n\n${button}: ${url}\n\n${footer}${footerUrl ? `\nE-Mail-Mitteilungen ausschalten: ${footerUrl}` : ''}` }
}

export function verificationEmail({ profileName, url }) {
  const name = plain(profileName, 32) || 'Profil'
  return frame({ subject: 'MovieHub – E-Mail-Adresse bestätigen', eyebrow: 'DEIN PROFIL',
    title: 'Deine Filmhinweise per E-Mail',
    paragraphs: [`Für das Profil „${name}“ wurde diese E-Mail-Adresse eingetragen.`,
      'Bestätige die Adresse, damit du die persönlichen Mitteilungen zu deinen beobachteten Titeln auch per E-Mail erhältst.',
      'Der Link ist 24 Stunden gültig. Falls du die Mitteilungen nicht angefordert hast, brauchst du nichts zu tun.'],
    button: 'E-Mail-Adresse bestätigen', url,
    footer: 'MovieHub · Die Bestätigung gilt nur für dieses Profil.' })
}

export function titleNotificationEmail({ phase, title, profileName, stationName, providerNames = [], airingStartAt, sentAt, url, unsubscribeUrl }) {
  const name = plain(profileName, 32) || 'Profil'
  const mediaTitle = plain(title)
  const station = plain(stationName)
  let heading
  let detail
  if (phase === 'included-found') {
    heading = 'Jetzt inklusive'
    const names = providerNames.filter((name) => typeof name === 'string').slice(0, 20).map((name) => plain(name, 100)).filter(Boolean).join(', ')
    detail = names ? `Dein beobachteter Titel ist jetzt bei ${names} ohne Aufpreis verfügbar.`
      : 'Dein beobachteter Titel ist jetzt bei einem deiner ausgewählten Anbieter ohne Aufpreis verfügbar.'
  } else if (['tv-found', 'tv-final'].includes(phase) && Number.isFinite(airingStartAt) && station) {
    const date = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(airingStartAt)
    const time = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(airingStartAt)
    heading = phase === 'tv-found' ? 'Bald im TV' : sentAt >= airingStartAt ? 'Jetzt im TV' : 'Gleich im TV'
    detail = `${date} um ${time} Uhr (deutsche Zeit) auf ${station}.`
  } else throw new Error('invalid-mail-phase')
  return frame({ subject: `MovieHub – ${heading}: ${mediaTitle}`, eyebrow: heading.toUpperCase(), title: mediaTitle,
    paragraphs: [detail, `Eine persönliche Mitteilung für dein Profil „${name}“.`],
    button: 'MovieHub öffnen', url, footer: 'Du erhältst diese E-Mail, weil E-Mail-Mitteilungen für dieses Profil eingeschaltet sind.', footerUrl: unsubscribeUrl })
}
