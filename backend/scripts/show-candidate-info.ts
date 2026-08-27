import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function showCandidate() {
  const candidate = await prisma.candidate.findUnique({
    where: { id: "c1000000-0000-0000-0000-000000000001" },
  });

  console.log("-----------------------------------------");
  console.log("Candidate ID:    ", candidate?.id);
  console.log("First Name:      ", candidate?.firstName);
  console.log("Last Name:       ", candidate?.lastName);
  console.log("Current Email:   ", candidate?.email);
  console.log("Current Phone:   ", candidate?.phone);
  console.log("-----------------------------------------");

  await prisma.$disconnect();
}

showCandidate().catch(console.error);
