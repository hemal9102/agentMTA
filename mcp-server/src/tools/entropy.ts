/**
 * Academic Taxonomy & Dynamic Entropy Generator
 * D:\projects\MTAengine\mcp-server\src\tools\entropy.ts
 */

const DISCIPLINES = [
  'Oncology & Molecular Genetics',
  'Clinical Cardiology & Electrophysiology',
  'Applied Neurological Sciences',
  'Econometric Modeling & Quantitative Finance',
  'Advanced Computational Fluid Dynamics',
  'Microbiology & Pathogenic Immunology',
  'Renewable Energy Systems & Nanotechnology',
  'Environmental Toxicology & Public Health',
];

const DOCKET_PREFIXES = ['WWJ-VOL', 'GJRA-REV', 'PIJR-ACT', 'IJAR-PUB', 'IJSR-ARC'];

export function generateAcademicEntropy(recipientEmail: string) {
  let hash = 0;
  for (let i = 0; i < recipientEmail.length; i++) {
    hash = (hash << 5) - hash + recipientEmail.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);

  const selectedDiscipline = DISCIPLINES[absHash % DISCIPLINES.length];
  const prefix = DOCKET_PREFIXES[absHash % DOCKET_PREFIXES.length];
  const refCode = (absHash % 900000 + 100000).toString();
  const docket = `${prefix}-${refCode}`;

  return {
    discipline: selectedDiscipline,
    docket,
    refCode,
    epochHex: Math.floor(Date.now() / 1000).toString(16),
  };
}
