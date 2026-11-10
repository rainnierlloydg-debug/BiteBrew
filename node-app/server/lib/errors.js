export class ApiError extends Error {
  constructor(status, code, message, details = undefined) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const fail = (status, code, message, details) => { throw new ApiError(status, code, message, details); };
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.name === 'ZodError') return res.status(422).json({ error: { code: 'VALIDATION', message: 'Check the submitted information.', details: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) } });
  if (error.code === 'P2002') return res.status(409).json({ error: { code: 'DUPLICATE', message: 'That value is already used. Check existing or archived records.' } });
  if (error.code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'The record was not found.' } });
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'UPLOAD_TOO_LARGE', message: 'Choose an image smaller than 3 MB.' } });
  if (error.type === 'entity.too.large') return res.status(413).json({ error: { code: 'REQUEST_TOO_LARGE', message: 'The submitted request is too large.' } });
  const status = error.status || 500;
  if (status >= 500) console.error('Request failed:', req.method, req.path, error.code || error.name);
  res.status(status).json({ error: { code: error.code || 'SERVER_ERROR', message: status >= 500 ? 'The operation could not be completed. Retry using the same operation ID.' : error.message, ...(error.details !== undefined ? { details: error.details } : {}) } });
}
