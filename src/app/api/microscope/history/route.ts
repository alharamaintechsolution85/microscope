import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getScanHistory } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) return NextResponse.json({ error: "Sign in to view saved scan history." }, { status: 401 });
  try {
    const scans = await getScanHistory(session.user.id, { take: 50 });
    return NextResponse.json({ scans });
  } catch (error) {
    console.error("Scan history lookup failed", error);
    return NextResponse.json({ error: "Scan history could not be loaded." }, { status: 500 });
  }
}
