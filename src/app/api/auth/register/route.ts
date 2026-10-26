import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const registrationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128)
});

export async function POST(request: Request) {
  const input = registrationSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Provide a name, valid email, and password of at least 10 characters." }, { status: 400 });
  }
  try {
    const email = input.data.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.data.password, 12);
    const user = await prisma.user.create({
      data: { name: input.data.name, email, passwordHash },
      select: { id: true, name: true, email: true }
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Account registration failed." }, { status: 500 });
  }
}
