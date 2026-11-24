/**
 * Inline CID Image Processor for MTAengine MCP Server
 * D:\projects\MTAengine\mcp-server\src\tools\cidImage.ts
 */

import crypto from 'crypto';

export interface CidImageResult {
  processedHtml: string;
  attachments: Array<{
    cid: string;
    filename: string;
    mimeType: string;
    base64Data: string;
    sizeBytes: number;
  }>;
  totalBytes: number;
  warnings: string[];
}

export function processInlineCidImages(
  html: string,
  imageMap?: Record<string, { base64Data: string; mimeType: string; filename?: string }>
): CidImageResult {
  const attachments: CidImageResult['attachments'] = [];
  const warnings: string[] = [];
  let totalBytes = 0;

  // 1. Process base64 data URIs
  let processedHtml = html.replace(
    /(<img\b[^>]*?\bsrc=["'])data:image\/(png|jpeg|jpg|gif|webp);base64,([^"']+)(["'])/gi,
    (match, prefix, ext, b64Data, suffix) => {
      const mimeSubtype = ext.toLowerCase() === 'jpg' ? 'jpeg' : ext.toLowerCase();
      const mimeType = `image/${mimeSubtype}`;
      const buf = Buffer.from(b64Data, 'base64');
      const sizeBytes = buf.length;
      totalBytes += sizeBytes;

      const hash = crypto.createHash('md5').update(buf).digest('hex').substring(0, 12);
      const cid = `inline_img_${hash}`;
      const filename = `${cid}.${mimeSubtype}`;

      attachments.push({
        cid,
        filename,
        mimeType,
        base64Data: b64Data,
        sizeBytes,
      });

      return `${prefix}cid:${cid}${suffix}`;
    }
  );

  // 2. Process custom image map mappings (e.g. { "journal_logo": { base64Data: "...", mimeType: "image/png" } })
  if (imageMap) {
    for (const [key, asset] of Object.entries(imageMap)) {
      const buf = Buffer.from(asset.base64Data, 'base64');
      const sizeBytes = buf.length;
      totalBytes += sizeBytes;
      const cid = `cid_${key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const filename = asset.filename || `${cid}.png`;

      // Replace src="key" or src="cid:key"
      const regex = new RegExp(`(<img\\b[^>]*?\\bsrc=["'])(?:cid:)?${key}(["'])`, 'gi');
      processedHtml = processedHtml.replace(regex, `$1cid:${cid}$2`);

      attachments.push({
        cid,
        filename,
        mimeType: asset.mimeType,
        base64Data: asset.base64Data,
        sizeBytes,
      });
    }
  }

  // Safe deliverability checks
  if (totalBytes > 100 * 1024) {
    warnings.push(`Warning: Total inline image size is ${(totalBytes / 1024).toFixed(1)} KB. Keep under 100 KB to avoid slow mobile sync.`);
  }

  return {
    processedHtml,
    attachments,
    totalBytes,
    warnings,
  };
}
