import { useMemo } from 'react';

// Compute an alignment of lines using a simple LCS so identical lines line up.
function alignLines(leftLines, rightLines) {
  const n = leftLines.length;
  const m = rightLines.length;
  // DP table of lengths.
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const li = leftLines[i];
    for (let j = m - 1; j >= 0; j--) {
      if (li === rightLines[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Reconstruct alignment.
  const rows = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (leftLines[i] === rightLines[j]) {
      rows.push({ left: leftLines[i], right: rightLines[j], type: 'same' });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ left: leftLines[i], right: '', type: 'left-only' });
      i++;
    } else {
      rows.push({ left: '', right: rightLines[j], type: 'right-only' });
      j++;
    }
  }
  while (i < n) {
    rows.push({ left: leftLines[i], right: '', type: 'left-only' });
    i++;
  }
  while (j < m) {
    rows.push({ left: '', right: rightLines[j], type: 'right-only' });
    j++;
  }
  return rows;
}

export default function APLComparison({ simc, hekili, generatedAt }) {
  const { rows } = useMemo(() => {
    const leftLines = (simc || '').replace(/\r\n?/g, '\n').split('\n');
    const rightLines = (hekili || '').replace(/\r\n?/g, '\n').split('\n');
    const rows = alignLines(leftLines, rightLines);
    return { rows };
  }, [simc, hekili]);

  return (
    <div className="flex flex-col gap-2">
      {generatedAt && (
        <div className="text-sm text-gray-500">Generated: {generatedAt}</div>
      )}
      <div className="flex flex-col border rounded-md overflow-hidden min-h-[60vh]">
        <header className="px-3 py-2 bg-gray-100 dark:bg-gray-800 border-b font-semibold text-sm flex">
          <div className="w-1/2 pr-2">SimulationCraft (simc)</div>
          <div className="w-1/2 pl-2 border-l border-gray-300 dark:border-gray-700">Hekili</div>
        </header>
        <div className="flex-1 overflow-auto font-mono text-[11px] leading-snug">
          <div>
            {rows.map((r, idx) => {
              const zebra = idx % 2 === 0 ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 dark:bg-gray-900/50';
              const diffBg = r.type === 'same' ? '' : r.type === 'left-only' ? 'bg-red-50 dark:bg-red-900/30' : 'bg-green-50 dark:bg-green-900/30';
              return (
                <div
                  key={idx}
                  className={`flex border-b border-gray-100 dark:border-gray-800 ${zebra}`}
                >
                  <pre className={`m-0 w-1/2 whitespace-pre-wrap px-2 py-0.5 overflow-hidden ${r.type === 'left-only' ? diffBg : ''}`}>{r.left === '' ? '\u00A0' : r.left}</pre>
                  <pre className={`m-0 w-1/2 whitespace-pre-wrap px-2 py-0.5 overflow-hidden border-l border-gray-200 dark:border-gray-700 ${r.type === 'right-only' ? diffBg : ''}`}>{r.right === '' ? '\u00A0' : r.right}</pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
