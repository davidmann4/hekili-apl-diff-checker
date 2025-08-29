import fs from 'node:fs/promises';
import path from 'node:path';
import APLComparison from '../components/APLComparison';

async function loadData() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'apl-data.json');
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { error: e.message };
  }
}

export default async function Home() {
  const data = await loadData();
  const items = data?.items || [];
  const first = items[0];
  // Renamed for clarity: upstreamContent -> simc, sourceContent -> hekili
  const simc = first?.upstreamContent || 'No simc content available.';
  const hekili = first?.sourceContent || 'No Hekili content available.';

  return (
    <main className="flex flex-col min-h-screen p-4 gap-4">
      <h1 className="text-2xl font-bold">APL Diff Viewer</h1>
      {data.error && (
        <div className="text-red-500">Failed to load data: {data.error}</div>
      )}
      {!items.length && !data.error && (
        <div className="text-gray-500">No APL data found. Run the fetch script first.</div>
      )}
      {items.length > 0 && (
        <APLComparison simc={simc} hekili={hekili} generatedAt={data.generatedAt} />
      )}
    </main>
  );
}
