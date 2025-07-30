import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export interface ReleaseNote {
  date: string;
  content: string;
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'RELEASE_NOTES.md');
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // Split the content by date headers (e.g., "## 2025-07-30")
    // The regex splits the string by lines that start with ##, keeping the delimiter.
    const sections = fileContent.split(/^##\s+/m).slice(1);

    const releaseNotes: ReleaseNote[] = sections.map(section => {
      const [date, ...contentParts] = section.split('\n');
      const content = contentParts.join('\n').trim();
      return { date: date.trim(), content };
    });

    return NextResponse.json(releaseNotes);

  } catch (error) {
    console.error('Error reading or parsing release notes:', error);
    return NextResponse.json(
      { error: 'Could not load release notes.' },
      { status: 500 }
    );
  }
}
