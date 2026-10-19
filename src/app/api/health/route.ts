import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function chatConfigured() {
  const env = process.env;
  return ['PATIENT_BOT_ID', 'OPENAPI_TOKEN'].every((key) => typeof env[key] === 'string' && env[key]?.trim());
}

function speechConfigured() {
  const env = process.env;
  return ['OPENAPI_TOKEN', 'PATIENT_VOICE_ID'].every((key) => typeof env[key] === 'string' && env[key]?.trim());
}

export async function GET() {
  return NextResponse.json({ configured: chatConfigured(), tts: speechConfigured() });
}
