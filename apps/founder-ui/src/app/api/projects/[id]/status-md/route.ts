import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const SAFE_ID = /^[a-zA-Z0-9-]+$/

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const { id } = params

  if (!SAFE_ID.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const filePath = path.resolve(process.cwd(), '../../docs/projects', id, 'STATUS.md')

  try {
    const content = await fs.readFile(filePath, 'utf-8')
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}
