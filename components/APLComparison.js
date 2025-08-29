export default function APLComparison({ simc, hekili, generatedAt }) {
  return (
    <div className="flex flex-col gap-2">
      {generatedAt && (
        <div className="text-sm text-gray-500">Generated: {generatedAt}</div>
      )}
      <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-[60vh]">
        <section className="flex flex-col border rounded-md overflow-hidden">
          <header className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b font-semibold text-sm">SimulationCraft (simc)</header>
          <pre className="flex-1 m-0 p-3 overflow-auto text-xs whitespace-pre-wrap font-mono">{simc}</pre>
        </section>
        <section className="flex flex-col border rounded-md overflow-hidden">
          <header className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b font-semibold text-sm">Hekili</header>
          <pre className="flex-1 m-0 p-3 overflow-auto text-xs whitespace-pre-wrap font-mono">{hekili}</pre>
        </section>
      </div>
    </div>
  );
}
