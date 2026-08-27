import { PrismaClient, AuditActorType } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";

const prisma = new PrismaClient();

async function updateCandidateContact() {
  console.log("=================================================");
  console.log("✏️ UPDATING CANDIDATE CONTACT DETAILS IN POSTGRESQL");
  console.log("=================================================\n");

  const candidateId = "c1000000-0000-0000-0000-000000000001";
  const newFirstName = "نيرة";
  const newLastName = "محمد طارق";
  const newEmail = "nona09022@gmail.com";
  const newPrimaryPhone = "01012644188";
  const newAlternatePhone = "01557308971";
  const formattedPhone = `${newPrimaryPhone} / ${newAlternatePhone}`;

  // 1. Fetch Existing Candidate Record
  const existingCandidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
          generatedEmails: true,
        },
      },
      resumes: true,
    },
  });

  if (!existingCandidate) {
    throw new Error(`Candidate with ID ${candidateId} not found in database.`);
  }

  const beforeSummary = {
    firstName: existingCandidate.firstName,
    lastName: existingCandidate.lastName,
    email: existingCandidate.email,
    phone: existingCandidate.phone,
  };

  const now = new Date();

  // 2. Update Candidate Record
  const updatedCandidate = await prisma.candidate.update({
    where: { id: candidateId },
    data: {
      firstName: newFirstName,
      lastName: newLastName,
      email: newEmail,
      phone: formattedPhone,
      updatedAt: now,
    },
  });

  console.log("✓ Candidate record updated in PostgreSQL.");

  // 3. Update Parsed Facts in Resumes for this Candidate
  for (const resume of existingCandidate.resumes) {
    let parsedData = resume.parsedData as any;
    if (parsedData && typeof parsedData === "object") {
      parsedData = {
        ...parsedData,
        firstName: newFirstName,
        lastName: newLastName,
        email: newEmail,
        phone: formattedPhone,
      };
      await prisma.resume.update({
        where: { id: resume.id },
        data: {
          parsedData,
          updatedAt: now,
        },
      });
    }
  }
  console.log(`✓ Updated parsed facts across ${existingCandidate.resumes.length} CV records.`);

  // 4. Update Generated Emails Linked to this Candidate's Applications
  for (const app of existingCandidate.applications) {
    for (const email of app.generatedEmails) {
      let updatedSubject = email.subject.replace(/Nayera Tarek Mohamed/g, "نيرة محمد طارق");
      let updatedBody = email.body
        .replace(/Nayera Tarek Mohamed/g, "نيرة محمد طارق")
        .replace(/nayera\.tarek@example\.com/gi, newEmail)
        .replace(/\+20 10 1234 5678/g, formattedPhone);

      // Recalculate contentHash
      const newHash = createHash("sha256").update(updatedSubject + updatedBody).digest("hex");

      await prisma.generatedEmail.update({
        where: { id: email.id },
        data: {
          subject: updatedSubject,
          body: updatedBody,
          contentHash: newHash,
          updatedAt: now,
        },
      });
    }
  }
  console.log(`✓ Updated personalized drafts across ${existingCandidate.applications.length} applications.`);

  // 5. Create Traceable Audit Log
  const correlationId = `corr-cand-update-${Date.now()}`;
  const auditLog = await prisma.auditLog.create({
    data: {
      id: randomUUID(),
      candidateId,
      actorType: AuditActorType.USER,
      actorId: "system-admin",
      action: "CANDIDATE_CONTACT_INFO_UPDATED",
      resourceType: "Candidate",
      resourceId: candidateId,
      eventType: "CANDIDATE_CREDENTIALS_CORRECTED",
      correlationId,
      beforeSummary,
      afterSummary: {
        firstName: newFirstName,
        lastName: newLastName,
        email: newEmail,
        phone: newPrimaryPhone,
        alternatePhone: newAlternatePhone,
        combinedPhone: formattedPhone,
      },
      safeMetadata: {
        reason: "Correction of candidate real contact info from CV",
        source: "USER_DIRECT_UPDATE",
      },
      occurredAt: now,
      createdAt: now,
    },
  });

  console.log("✓ AuditLog entry recorded with correlation ID:", correlationId);

  // 6. Verification from PostgreSQL
  console.log("\n=================================================");
  console.log("🔍 POST-UPDATE VERIFICATION FROM POSTGRESQL");
  console.log("=================================================\n");

  const verifiedCandidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    include: {
      applications: {
        where: { id: "da000000-0000-0000-0000-000000000001" },
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
        },
      },
    },
  });

  const targetApp = verifiedCandidate?.applications[0];
  const targetEmail = targetApp?.selectedGeneratedEmail;

  console.log("Candidate ID:                 ", verifiedCandidate?.id);
  console.log("الاسم الجديد (New Name):       ", `${verifiedCandidate?.firstName} ${verifiedCandidate?.lastName}`);
  console.log("البريد الجديد (New Email):     ", verifiedCandidate?.email);
  console.log("الهاتف الجديد (New Phone):     ", verifiedCandidate?.phone);
  console.log("Application ID:               ", targetApp?.id);
  console.log("Application Status:           ", targetApp?.status);
  console.log("GeneratedEmail ID:            ", targetEmail?.id);
  console.log("Recipient:                    ", targetEmail?.recipientEmail);
  console.log("Subject:                      ", targetEmail?.subject);
  console.log("GeneratedEmail reviewStatus:  ", targetEmail?.reviewStatus);
  console.log("Latest AuditLog Action:       ", `${auditLog.action} (${auditLog.eventType})`);
  console.log("AuditLog ID:                  ", auditLog.id);

  console.log("\n=================================================");
  console.log("✅ CANDIDATE CONTACT UPDATE COMPLETE");
  console.log("=================================================\n");

  await prisma.$disconnect();
}

updateCandidateContact().catch(async (e) => {
  console.error("FATAL ERROR:", e);
  await prisma.$disconnect();
  process.exit(1);
});
