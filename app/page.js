import fs from 'node:fs/promises';
import path from 'node:path';
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

export default async function Home() {
  const data = await loadData();
  const items = data?.items || [];
  const withLabels = items.map((it, idx) => ({
    ...it,
    index: idx,
    label: it.sourceUrl ? it.sourceUrl.split('/').pop() : `Item ${idx + 1}`
  }));
  return (
    <main className="flex flex-col min-h-screen p-4 gap-6">
      <h1 className="text-2xl font-bold">APL Diff Viewer</h1>
      {data.error && <div className="text-red-500">Failed to load data: {data.error}</div>}
      {!items.length && !data.error && (
        <div className="text-gray-500">No APL data found. Run the fetch script first.</div>
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Available APL Files</h2>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {withLabels.map(it => {
              const slug = `${it.index}-${it.label}`;
              return (
                <li key={it.index}>
                  <Link className="text-blue-600 hover:underline" href={`/apl/${slug}`}>{it.label}</Link>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-gray-500">Click a file name to view its SimulationCraft vs Hekili diff.</p>
        </div>
      )}
    </main>
  );
}

export const metadata = {
  title: "Home",
};
