import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const picks = await prisma.pick.findMany({
    where: { date: today },
    orderBy: { confidence: "desc" },
  });

  return NextResponse.json({ date: today.toISOString().slice(0, 10), picks });
}
