/**
 * MTA-STS (RFC 8461) & TLS-RPT (RFC 8460) Tool for MTAengine MCP Server
 * D:\projects\MTAengine\mcp-server\src\tools\mtaSts.ts
 */

import dns from 'dns/promises';

export interface MtaStsPolicyResult {
  domain: string;
  policyUrl: string;
  policyBody: string;
  dnsRecords: {
    mtaSts: { host: string; type: string; value: string };
    tlsRpt: { host: string; type: string; value: string };
  };
  mode: string;
  maxAge: number;
  id: string;
}

export function generateMtaStsPolicy(
  domain: string,
  mxList?: string[],
  mode: string = 'enforce',
  maxAge: number = 604800
): MtaStsPolicyResult {
  const cleanDomain = domain.toLowerCase().trim();
  const policyId = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);

  const defaultMx = mxList && mxList.length > 0 ? mxList : [
    `mail.${cleanDomain}`,
    'mail.journal-alpha.org',
    'mail.journal-network.org',
  ];

  const uniqueMx = Array.from(new Set(defaultMx.map(h => h.toLowerCase().trim())));

  const policyLines = [
    'version: STSv1',
    `mode: ${mode}`,
    ...uniqueMx.map(mx => `mx: ${mx}`),
    `max_age: ${maxAge}`,
  ];

  return {
    domain: cleanDomain,
    policyUrl: `https://mta-sts.${cleanDomain}/.well-known/mta-sts.txt`,
    policyBody: policyLines.join('\r\n'),
    dnsRecords: {
      mtaSts: {
        host: `_mta-sts.${cleanDomain}`,
        type: 'TXT',
        value: `v=STSv1; id=${policyId};`,
      },
      tlsRpt: {
        host: `_smtp._tls.${cleanDomain}`,
        type: 'TXT',
        value: `v=TLSRPTv1; rua=mailto:tls-reports@${cleanDomain}`,
      },
    },
    mode,
    maxAge,
    id: policyId,
  };
}

export async function auditMtaSts(domain: string): Promise<Record<string, any>> {
  const cleanDomain = domain.toLowerCase().trim();
  let stsTxt = 'NOT_CONFIGURED';
  let rptTxt = 'NOT_CONFIGURED';

  try {
    const stsRecords = await dns.resolveTxt(`_mta-sts.${cleanDomain}`);
    for (const chunk of stsRecords) {
      const full = chunk.join('');
      if (full.toLowerCase().includes('v=stsv1')) {
        stsTxt = full;
        break;
      }
    }
  } catch (e) {}

  try {
    const rptRecords = await dns.resolveTxt(`_smtp._tls.${cleanDomain}`);
    for (const chunk of rptRecords) {
      const full = chunk.join('');
      if (full.toLowerCase().includes('v=tlsrptv1')) {
        rptTxt = full;
        break;
      }
    }
  } catch (e) {}

  const isCompliant = stsTxt !== 'NOT_CONFIGURED' && rptTxt !== 'NOT_CONFIGURED';

  return {
    domain: cleanDomain,
    mtaStsDns: stsTxt,
    tlsRptDns: rptTxt,
    policyUrl: `https://mta-sts.${cleanDomain}/.well-known/mta-sts.txt`,
    status: isCompliant ? 'ENFORCED' : (stsTxt !== 'NOT_CONFIGURED' ? 'PARTIAL' : 'MISSING'),
    institutionalTrust: isCompliant ? '+25% (Institutional TLS Granted)' : 'Standard Sender',
  };
}
