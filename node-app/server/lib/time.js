import { z } from 'zod';
import { fail } from './errors.js';
export const localDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export function reportingRange(query = {}) {
  const schema = z.object({ from: z.iso.date().default(localDate()), to: z.iso.date().default(localDate()) });
  const { from, to } = schema.parse(query);
  if (to < from) fail(422, 'DATE_RANGE', 'The end date must be on or after the start date.');
  const start = new Date(from + 'T00:00:00+08:00'), end = new Date(to + 'T00:00:00+08:00');
  end.setUTCDate(end.getUTCDate() + 1);
  if ((end - start) / 86400000 > 366) fail(422, 'DATE_RANGE', 'Select a reporting period of at most 366 days.');
  return { from, to, start, end, where: { gte: start, lt: end } };
}
export function pagination(query = {}) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(100, Number.parseInt(query.pageSize, 10) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
export function pageResult(data, total, { page, pageSize }) { return { data, meta: { total, page, pageSize, lastPage: Math.max(1, Math.ceil(total / pageSize)) } }; }
