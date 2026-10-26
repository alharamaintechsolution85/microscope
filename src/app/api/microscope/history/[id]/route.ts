import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { deleteScanHistory } from "@/lib/db";

export async function DELETE(_request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) return NextResponse.json({ error: "Sign in to delete saved scans." }, { status: 401 });
  try {
    await deleteScanHistory(context.params.id, session.user.id);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Scan was not found or cannot be deleted.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("Scan deletion failed", error);
    return NextResponse.json({ error: "Scan deletion failed." }, { status: 500 });
  }
}
