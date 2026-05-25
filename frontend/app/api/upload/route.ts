import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const response = await fetch(`${BACKEND_URL}/api/upload`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch {
    return NextResponse.json(
      {
        detail: "Upload proxy request failed",
      },
      {
        status: 500,
      }
    );
  }
}