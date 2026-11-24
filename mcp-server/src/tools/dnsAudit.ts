/**
 * DNS & Domain Authentication Health Auditor
 * D:\projects\MTAengine\mcp-server\src\tools\dnsAudit.ts
 */

import { promises as dns } from 'dns';

export async function auditDomainAuth(domain: string) {
  const cleanDomain = domain.toLowerCase().trim();
  const results: Record<string, any> = {
    domain: cleanDomain,
    timestamp: new Date().toISOString(),
    spf: { status: 'UNKNOWN' },
    dkim: { status: 'UNKNOWN' },
    dmarc: { status: 'UNKNOWN' },
    mx: [],
  };

  // 1. Check MX
  try {
    const mxRecords = await dns.resolveMx(cleanDomain);
    results.mx = mxRecords.sort((a, b) => a.priority - b.priority);
  } catch (e: any) {
    results.mxError = e.message;
  }

  // 2. Check SPF in TXT
  try {
    const txtRecords = await dns.resolveTxt(cleanDomain);
    const flatTxt = txtRecords.map((r) => r.join(''));
    const spfRecord = flatTxt.find((r) => r.startsWith('v=spf1'));
    if (spfRecord) {
      results.spf = {
        status: 'PASS',
        record: spfRecord,
        hasExplicitIp: spfRecord.includes('ip4:'),
        isHardFail: spfRecord.includes('-all'),
      };
    } else {
      results.spf = { status: 'FAIL', reason: 'No v=spf1 TXT record found' };
    }
  } catch (e: any) {
    results.spf = { status: 'FAIL', error: e.message };
  }

  // 3. Check DMARC
  try {
    const dmarcTxt = await dns.resolveTxt(`_dmarc.${cleanDomain}`);
    const flatDmarc = dmarcTxt.map((r) => r.join(''));
    const dmarcRecord = flatDmarc.find((r) => r.startsWith('v=DMARC1'));
    if (dmarcRecord) {
      const isQuarantine = dmarcRecord.includes('p=quarantine');
      const isReject = dmarcRecord.includes('p=reject');
      results.dmarc = {
        status: isQuarantine || isReject ? 'STRONG' : 'WEAK_MONITORING',
        record: dmarcRecord,
      };
    } else {
      results.dmarc = { status: 'MISSING', reason: 'No _dmarc TXT record' };
    }
  } catch (e: any) {
    results.dmarc = { status: 'MISSING', error: e.message };
  }

  // 4. Check Kumo DKIM selector
  try {
    const dkimTxt = await dns.resolveTxt(`kumo._domainkey.${cleanDomain}`);
    const flatDkim = dkimTxt.map((r) => r.join(''));
    const dkimRecord = flatDkim.find((r) => r.startsWith('v=DKIM1'));
    if (dkimRecord) {
      results.dkim = {
        selector: 'kumo',
        status: 'PASS',
        record: dkimRecord,
      };
    } else {
      results.dkim = { selector: 'kumo', status: 'FAIL', reason: 'kumo._domainkey not found' };
    }
  } catch (e: any) {
    results.dkim = { selector: 'kumo', status: 'FAIL', error: e.message };
  }

  return results;
}
