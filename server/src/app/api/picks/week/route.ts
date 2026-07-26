import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const picks = await prisma.pick.findMany({
    where: { period: "WEEKLY" },
    orderBy: { confidence: "desc" },
  });

  const generatedAt = picks[0]?.date.toISOString().slice(0, 10) ?? null;

  return NextResponse.json({ date: generatedAt, picks });
}
