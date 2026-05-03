import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { name: 'Vera-NextJS-Bot', version: '1.0.0', author: 'My Team' },
    { status: 200 }
  );
}
