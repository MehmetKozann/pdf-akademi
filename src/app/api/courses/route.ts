import { NextRequest, NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/auth/session";
import { repository } from "@/lib/db/repository";
import { courseSchema } from "@/lib/security/validation";

export async function GET() {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  const courses = await repository.listCourses(user.id);
  return NextResponse.json({ courses });
}

export async function POST(req: NextRequest) {
  const { user, errorResponse } = await requireAuthUser();
  if (errorResponse) return errorResponse;

  try {
    const body = await req.json();
    const parsed = courseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Geçersiz ders bilgisi." },
        { status: 400 }
      );
    }

    const course = await repository.createCourse(user.id, parsed.data);
    return NextResponse.json({ course }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Ders oluşturulurken hata oluştu.",
      },
      { status: 500 }
    );
  }
}

