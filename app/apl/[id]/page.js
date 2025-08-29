import fs from 'node:fs/promises';
import path from 'node:path';
import APLComparison from '../../../components/APLComparison';
import Link from 'next/link';

async function loadData() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'apl-data.json');
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { error: e.message };
  }
}

export default async function APLPage({ params }) {
  const data = await loadData();
  const items = data?.items || [];
  // Support routes like 3-DemonHunterHavoc.simc by extracting leading integer
  const raw = params.id;
  const m = raw.match(/^(\d+)/);
  const idx = m ? parseInt(m[1], 10) : parseInt(raw, 10);
  const item = !isNaN(idx) && idx >= 0 && idx < items.length ? items[idx] : null;
  const simc = item?.upstreamContent || 'No simc content available.';
  const hekili = item?.sourceContent || 'No Hekili content available.';
  const label = item?.sourceUrl ? item.sourceUrl.split('/').pop() : `Item ${idx}`;
  return (
    <main className="flex flex-col min-h-screen p-4 gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-bold">{label}</h1>
        <Link href="/" className="text-sm text-blue-600 hover:underline">← Back to list</Link>
      </div>
      {data.error && <div className="text-red-500 text-sm">Failed to load data: {data.error}</div>}
      {!item && !data.error && (
        <div className="text-gray-500">Invalid APL index.</div>
      )}
      {item && (
        <APLComparison simc={simc} hekili={hekili} generatedAt={data.generatedAt} />
      )}
    </main>
  );
}
