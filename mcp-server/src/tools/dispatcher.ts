/**
 * SMTP Injection Client to KumoMTA
 * D:\projects\MTAengine\mcp-server\src\tools\dispatcher.ts
 */

import nodemailer from 'nodemailer';

export interface DispatchOptions {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  mailClass?: 'transactional' | 'bulk';
  calendarIcs?: string;
  kumoHost?: string;
  kumoPort?: number;
}

export async function dispatchViaKumo(opts: DispatchOptions) {
  const host = opts.kumoHost || '127.0.0.1';
  const port = opts.kumoPort || 2525;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    tls: {
      rejectUnauthorized: false,
    },
  });

  const mailOptions: nodemailer.SendMailOptions = {
    from: opts.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    headers: {
      'X-Mail-Class': opts.mailClass || (opts.calendarIcs ? 'transactional' : 'bulk'),
    },
  };

  if (opts.calendarIcs) {
    mailOptions.attachments = [
      {
        filename: 'booking.ics',
        content: opts.calendarIcs,
        contentType: 'text/calendar; name="booking.ics"; method=PUBLISH; charset=UTF-8',
        encoding: 'utf-8',
      },
    ];
  }

  const info = await transporter.sendMail(mailOptions);
  return {
    accepted: info.accepted,
    rejected: info.rejected,
    messageId: info.messageId,
    response: info.response,
  };
}
