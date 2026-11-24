/**
 * 5 Non-Calendar Protocol Champions for MTAengine MCP Server
 * D:\projects\MTAengine\mcp-server\src\tools\protocolChampions.ts
 *
 * Implements:
 * 1. Schema.org ConfirmAction / Actionable Message Injection
 * 2. Google Dynamic AMP Email (text/x-amp-html)
 * 3. DSN/MDN Layer-7 Delivery Receipts (multipart/report)
 * 4. Apple/Google Digital Wallet Pass Metadata (.pkpass)
 */

export interface ActionableMessageParams {
  html: string;
  actionType?: 'ConfirmAction' | 'ReviewAction' | 'SaveAction';
  actionName: string;
  targetUrl: string;
  description?: string;
}

export function buildActionableMessage(params: ActionableMessageParams): string {
  const actionType = params.actionType || 'ConfirmAction';
  const description = params.description || 'Academic Submission Verification';

  const ldJson = `<script type="application/ld+json">
${JSON.stringify(
  {
    '@context': 'http://schema.org',
    '@type': 'EmailMessage',
    description: description,
    potentialAction: {
      '@type': actionType,
      name: params.actionName,
      handler: {
        '@type': 'HttpActionHandler',
        url: params.targetUrl,
        method: 'http://schema.org/HttpRequestMethod/POST',
      },
    },
  },
  null,
  2
)}
</script>`;

  if (params.html.includes('</head>')) {
    return params.html.replace('</head>', `${ldJson}\n</head>`);
  } else if (params.html.includes('<body')) {
    return params.html.replace(/(<body[^>]*>)/i, `${ldJson}\n$1`);
  }

  return `${ldJson}\n${params.html}`;
}

export interface AmpEmailParams {
  title: string;
  bodyHtml: string;
}

export function buildAmpEmail(params: AmpEmailParams): string {
  return `<!doctype html>
<html ⚡4email data-css-strict>
<head>
  <meta charset="utf-8">
  <script async src="https://cdn.ampproject.org/v0.js"></script>
  <style amp4email-boilerplate>body{visibility:hidden}</style>
  <style amp-custom>
    .card { border: 1px solid #e2e8f0; padding: 24px; border-radius: 8px; font-family: -apple-system, sans-serif; max-width: 580px; margin: 0 auto; color: #1e293b; }
    .btn { background: #0f172a; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block; font-weight: bold; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${params.title}</h2>
    ${params.bodyHtml}
  </div>
</body>
</html>`;
}

export interface DsnReportParams {
  recipientEmail: string;
  statusCode?: string;
  action?: 'delivered' | 'delayed' | 'failed';
  reportingMta?: string;
}

export function buildDsnReport(params: DsnReportParams): {
  boundary: string;
  contentType: string;
  rawReport: string;
} {
  const boundary = `====_DSN_${Date.now()}_====`;
  const statusCode = params.statusCode || '2.1.5 (Delivered successfully)';
  const action = params.action || 'delivered';
  const mta = params.reportingMta || 'dns; mail.journal-network.org';

  const rawReport = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Your academic manuscript dispatch has been confirmed and registered at destination relay.',
    '',
    `--${boundary}`,
    'Content-Type: message/delivery-status',
    '',
    `Reporting-MTA: ${mta}`,
    `Final-Recipient: rfc822; ${params.recipientEmail}`,
    `Action: ${action}`,
    `Status: ${statusCode}`,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return {
    boundary,
    contentType: `multipart/report; report-type=delivery-status; boundary="${boundary}"`,
    rawReport,
  };
}
