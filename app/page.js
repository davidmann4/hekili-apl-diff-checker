import fs from 'node:fs/promises';
import path from 'node:path';

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
  const sourceContent = first?.sourceContent || 'No source content available.';
  const upstreamContent = first?.upstreamContent || 'No upstream content available.';

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
        <div className="flex flex-col gap-2">
          <div className="text-sm text-gray-500">Generated: {data.generatedAt}</div>
          <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-[60vh]">
            <section className="flex flex-col border rounded-md overflow-hidden">
              <header className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b font-semibold text-sm">Upstream (SimulationCraft)</header>
              <pre className="flex-1 m-0 p-3 overflow-auto text-xs whitespace-pre-wrap font-mono">{upstreamContent}</pre>
            </section>
            <section className="flex flex-col border rounded-md overflow-hidden">
              <header className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b font-semibold text-sm">Hekili</header>
              <pre className="flex-1 m-0 p-3 overflow-auto text-xs whitespace-pre-wrap font-mono">{sourceContent}</pre>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
