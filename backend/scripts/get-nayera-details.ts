import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const candidate = await prisma.candidate.findFirst({
    where: {
      OR: [
        { email: { contains: "nayera" } },
        { firstName: { contains: "Nayera" } },
        { id: "c1000000-0000-0000-0000-000000000001" },
      ],
    },
    include: {
      applications: {
        include: {
          job: { include: { company: true } },
          selectedGeneratedEmail: true,
        },
      },
      resumes: true,
    },
  });

  console.log("Candidate summary:", {
    id: candidate?.id,
    email: candidate?.email,
    firstName: candidate?.firstName,
    lastName: candidate?.lastName,
    targetRoles: candidate?.targetRoles,
    consentStatus: candidate?.consentStatus,
    isActive: candidate?.isActive,
  });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
