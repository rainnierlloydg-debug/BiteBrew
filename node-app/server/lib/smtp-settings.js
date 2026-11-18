// Shared by the confirmation sender and the administrator's local setup tool.
export function smtpSettings(env = process.env) {
  const host = (env.SMTP_HOST || '').trim();
  const user = (env.SMTP_USER || '').trim();
  const from = (env.SMTP_FROM || (user.includes('@') ? user : '')).trim();
  const pass = host.toLowerCase() === 'smtp.gmail.com' ? (env.SMTP_PASS || '').replace(/\s/g, '') : env.SMTP_PASS || '';
  const port = Number(env.SMTP_PORT || (env.SMTP_SECURE === 'true' ? 465 : 587));
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465;
  const missing = [], errors = [];
  if (!host) missing.push('SMTP_HOST');
  if (!from) missing.push('SMTP_FROM');
  if (user && !pass) missing.push('SMTP_PASS');
  if (pass && !user) missing.push('SMTP_USER');
  if (host.toLowerCase() === 'smtp.gmail.com' && !user && !missing.includes('SMTP_USER')) missing.push('SMTP_USER');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('SMTP_PORT must be a valid port number.');
  if (env.SMTP_SECURE && !['true', 'false'].includes(env.SMTP_SECURE)) errors.push('SMTP_SECURE must be true or false.');
  if (port === 465 && !secure) errors.push('Port 465 requires SMTP_SECURE=true.');
  if (host && (/\s|\//.test(host) || host.includes(':'))) errors.push('SMTP_HOST must contain only the mail server hostname, without a URL or port.');
  if (/[\r\n]/.test(from + user + (env.SMTP_PASS || ''))) errors.push('SMTP values must not contain line breaks.');
  if (from && !from.includes('@')) errors.push('SMTP_FROM must include a sender email address.');
  return { configured: !missing.length && !errors.length, missing, errors, from, options: {
    host, port, secure, requireTLS: !secure,
    ...(user ? { auth: { user, pass } } : {}),
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true,
  } };
}
