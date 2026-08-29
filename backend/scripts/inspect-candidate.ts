import { listCandidates, listResumes } from "../src/services/candidate-service.js";

async function main() {
  const candidates = await listCandidates();
  console.log("Candidates in DB:", candidates.map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, isActive: c.isActive, consent: c.consentStatus })));
  for (const c of candidates) {
    const resumes = await listResumes(c.id);
    console.log(`Resumes for ${c.firstName}:`, resumes.map(r => ({ id: r.id, version: r.version, parseStatus: r.parseStatus })));
  }
  process.exit(0);
}

main().catch(console.error);
