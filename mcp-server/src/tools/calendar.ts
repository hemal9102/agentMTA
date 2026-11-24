/**
 * RFC 5545 iCalendar (.ics) Generator
 * D:\projects\MTAengine\mcp-server\src\tools\calendar.ts
 */

export interface CalendarEventParams {
  refCode?: string;
  domain?: string;
  subject?: string;
  organizerName?: string;
  organizerEmail?: string;
  portalUrl?: string;
  daysAhead?: number;
}

export function buildCalendarEvent(params: CalendarEventParams): string {
  const refCode = params.refCode
    ? params.refCode.replace(/[^a-zA-Z0-9_\-]/g, '')
    : Math.random().toString(36).substring(2, 10).toUpperCase();

  const domain = (params.domain || 'journal-network.org').toLowerCase();
  const subject = (params.subject || `Editorial Review Cutoff — #TX-${refCode}`)
    .replace(/[\r\n]+/g, ' ')
    .trim();

  const orgName = params.organizerName || 'Editorial Directorate';
  const orgEmail = (params.organizerEmail || `contact@${domain}`).toLowerCase();
  const portalUrl = params.portalUrl || `https://${domain}/portal?ref=${refCode}`;
  const daysAhead = params.daysAhead ?? 5;

  const now = new Date();
  const targetDate = new Date(now.getTime() + daysAhead * 86400000);

  const formatUtc = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const dateStr = targetDate.toISOString().replace(/[-:]/g, '').split('T')[0];
  const dtStart = `${dateStr}T100000Z`;
  const dtEnd = `${dateStr}T110000Z`;
  const nowUtc = formatUtc(now);

  const uid = `cal-${refCode}-${Math.floor(Date.now() / 1000)}@${domain}`;
  const deadlineHuman = targetDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const description =
    `Formal peer review evaluation and editorial deadline.\\n\\n` +
    `Upload Portal: ${portalUrl}\\n` +
    `Ref Code: #TX-${refCode}\\n` +
    `Submission Deadline: ${deadlineHuman}`;

  return [
    'BEGIN:VCALENDAR',
    'METHOD:PUBLISH',
    'PRODID:Microsoft Exchange Server 2010',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `ORGANIZER;CN=${orgName}:mailto:${orgEmail}`,
    `SUMMARY:${subject}`,
    `DESCRIPTION:${description}`,
    `LOCATION:Editorial Gateway (${domain})`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: Manuscript Submission Deadline Tomorrow!',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT3H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Final Notice: Manuscript Review Due in 3 Hours (#TX-${refCode})`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
