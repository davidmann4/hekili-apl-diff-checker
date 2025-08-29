"use client";
import { useMemo, useState, useCallback, useEffect, useRef } from 'react';

// Compute an alignment of lines using a simple LCS so identical lines line up.
function alignLines(leftLines, rightLines) {
  // Determine whether two lines should be considered equivalent for alignment purposes
  function linesEquivalent(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const parse = (s) => {
      const m = s.trim().match(/^actions\.([A-Za-z0-9_]+)(?:\s*\+=|=)\/?([A-Za-z0-9_]+)/);
      if (!m) return null;
      return { list: m[1], action: m[2] };
    };
    const pa = parse(a);
    const pb = parse(b);
    if (!pa || !pb) return false;
    return pa.list === pb.list && pa.action === pb.action;
  }
  const n = leftLines.length;
  const m = rightLines.length;
  // DP table of lengths.
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const li = leftLines[i];
    for (let j = m - 1; j >= 0; j--) {
      if (linesEquivalent(li, rightLines[j])) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // Reconstruct alignment.
  const rows = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (linesEquivalent(leftLines[i], rightLines[j])) {
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

// Tokenize a SIMC line into words / numbers / punctuation / whitespace so we can diff inline.
function tokenize(line) {
  if (!line) return [];
  const regex = /(\s+|[A-Za-z0-9_\.]+|[^A-Za-z0-9_\s])/g;
  const tokens = [];
  let m;
  while ((m = regex.exec(line)) !== null) {
    tokens.push(m[0]);
  }
  return tokens;
}

// Compute token level diff via LCS, labelling additions and removals.
function diffTokens(leftLine, rightLine) {
  const left = tokenize(leftLine);
  const right = tokenize(rightLine);
  const n = left.length, m = right.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (left[i] === right[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const leftOut = [];
  const rightOut = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      leftOut.push({ text: left[i], type: 'same' });
      rightOut.push({ text: right[j], type: 'same' });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      leftOut.push({ text: left[i], type: left[i].trim() ? 'remove' : 'same' });
      i++;
    } else {
      rightOut.push({ text: right[j], type: right[j].trim() ? 'add' : 'same' });
      j++;
    }
  }
  while (i < n) {
    leftOut.push({ text: left[i], type: left[i].trim() ? 'remove' : 'same' });
    i++;
  }
  while (j < m) {
    rightOut.push({ text: right[j], type: right[j].trim() ? 'add' : 'same' });
    j++;
  }
  return { leftTokens: leftOut, rightTokens: rightOut };
}

// Decide if two lines are similar enough to treat as a modification rather than deletion/addition.
function areSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const parse = (s) => {
    const m = s.trim().match(/^actions\.([A-Za-z0-9_]+)(?:\s*\+=|=)\/?([A-Za-z0-9_]+)/);
    if (!m) return null;
    return { list: m[1], action: m[2] };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return false;
  return pa.list === pb.list && pa.action === pb.action;
}

// Post-process aligned rows to pair adjacent left-only/right-only rows into modified rows when similar.
function mergeModifiedRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.type === 'left-only' && i + 1 < rows.length && rows[i + 1].type === 'right-only') {
      const next = rows[i + 1];
      if (areSimilar(r.left, next.right)) {
        const { leftTokens, rightTokens } = diffTokens(r.left, next.right);
        out.push({ type: 'modified', left: r.left, right: next.right, leftTokens, rightTokens });
        i++; // skip next
        continue;
      }
    }
    // Look ahead within a small window for a matching right-only line if immediate next doesn't match.
    if (r.type === 'left-only') {
      let matchIndex = -1;
      for (let k = i + 1; k < rows.length && k <= i + 5; k++) {
        if (rows[k].type === 'right-only' && areSimilar(r.left, rows[k].right)) {
          matchIndex = k;
          break;
        }
        // Stop scanning if we hit a 'same' line; alignment diverged.
        if (rows[k].type === 'same') break;
      }
      if (matchIndex !== -1) {
        const rightRow = rows[matchIndex];
        const { leftTokens, rightTokens } = diffTokens(r.left, rightRow.right);
        out.push({ type: 'modified', left: r.left, right: rightRow.right, leftTokens, rightTokens });
        // Push through any intervening right-only lines before match as their own rows (they are unmatched additions not paired).
        // Actually we already consumed rightRow; we should skip rows up to matchIndex.
        i = matchIndex; // loop increment will move past
        continue;
      }
    }
    out.push(r);
  }
  return out;
}

export default function APLComparison({ simc, hekili, generatedAt }) {
  const [copiedRow, setCopiedRow] = useState(null);
  const [linkedRow, setLinkedRow] = useState(null); // row number (0-based) that is highlighted via hash
  const scrollContainerRef = useRef(null);
  const { rows } = useMemo(() => {
    const leftLines = (simc || '').replace(/\r\n?/g, '\n').split('\n');
    const rightLines = (hekili || '').replace(/\r\n?/g, '\n').split('\n');
    let rows = mergeModifiedRows(alignLines(leftLines, rightLines));
    // Convert any 'same' rows whose text differs into 'modified' for inline diff visibility.
    rows = rows.map(r => {
      if (r.type === 'same' && r.left !== r.right) {
        const { leftTokens, rightTokens } = diffTokens(r.left, r.right);
        return { ...r, type: 'modified', leftTokens, rightTokens };
      }
      return r;
    });
    // If a right-side line is a Hekili-added comment starting with '##', force it to display as right-only
    // with an empty left side (even if alignment paired it with something).
    rows = rows.map(r => {
      if (r.right && r.right.trim().startsWith('##')) {
        return { left: '', right: r.right, type: 'right-only' };
      }
      return r;
    });
    return { rows };
  }, [simc, hekili]);

  const copyPair = useCallback((row, index) => {
    // Gather red/green diff content (removed / added) only.
    let removed = '';
    let added = '';
    if (row.type === 'left-only') {
      removed = row.left?.trim() || '';
    } else if (row.type === 'right-only') {
      added = row.right?.trim() || '';
    } else if (row.type === 'modified') {
      removed = row.leftTokens.filter(t => t.type === 'remove').map(t => t.text).join('').trim();
      added = row.rightTokens.filter(t => t.type === 'add').map(t => t.text).join('').trim();
    }
    const header = `ROW ${index}\nTYPE: ${row.type}`;
    const removedText = removed ? `REMOVED: ${removed}` : 'REMOVED: (none)';
    const addedText = added ? `ADDED: ${added}` : 'ADDED: (none)';
    const text = `${header}\n${removedText}\n${addedText}`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => setCopiedRow(index)).catch(() => {});
    } else {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopiedRow(index); } catch (e) {}
      document.body.removeChild(ta);
    }
    setTimeout(() => setCopiedRow(r => (r === index ? null : r)), 1500);
  }, []);

  // Handle scrolling/highlighting when hash present on mount or hash changes.
  useEffect(() => {
    function handleHash() {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash;
      if (!hash) return;
      const m = hash.match(/^#line-(\d+)$/i);
      if (m) {
        const oneBased = parseInt(m[1], 10);
        const zeroIdx = oneBased - 1;
        setLinkedRow(zeroIdx);
        // Defer to allow DOM paint.
        requestAnimationFrame(() => {
          const el = document.getElementById(`line-${oneBased}`);
          if (el && typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          }
        });
      }
    }
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const linkToLine = useCallback((index) => {
    if (typeof window === 'undefined') return;
    const oneBased = index + 1;
    const newHash = `#line-${oneBased}`;
    // Update hash without full scroll jump first (we manage scrolling).
    if (history && history.replaceState) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${newHash}`);
    } else {
      window.location.hash = newHash;
    }
    setLinkedRow(index);
    // Scroll & highlight
    const el = document.getElementById(`line-${oneBased}`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    // Copy shareable URL to clipboard to aid sharing.
    const shareUrl = window.location.href;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(shareUrl).catch(() => {});
    }
  }, []);

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
        <div className="px-3 py-1 text-[10px] bg-gray-50 dark:bg-gray-900 border-b flex flex-wrap gap-x-6 gap-y-1 text-gray-600 dark:text-gray-400 items-center">
          <div className="flex items-center gap-1"><span className="px-1 bg-red-200/70 dark:bg-red-900/60 rounded-sm inline-block"/> removed token</div>
          <div className="flex items-center gap-1"><span className="px-1 bg-green-200/70 dark:bg-green-900/60 rounded-sm inline-block"/> added token</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-red-50 dark:bg-red-900/30 border border-red-200/60 dark:border-red-800/60"/> line only in simc (removed)</div>
          <div className="flex items-center gap-1"><span className="w-3 h-3 inline-block bg-green-50 dark:bg-green-900/30 border border-green-200/60 dark:border-green-800/60"/> line only in hekili (added)</div>
          <div className="text-[9px] opacity-70">Use Copy to grab diff; Link copies a URL (hash) & scrolls/highlights.</div>
        </div>
  <div ref={scrollContainerRef} className="flex-1 overflow-auto font-mono text-[11px] leading-snug">
          <div>
            {rows.map((r, idx) => {
              const zebra = idx % 2 === 0 ? 'bg-white dark:bg-gray-950' : 'bg-gray-50 dark:bg-gray-900/50';
              const diffBg = r.type === 'same' ? '' : r.type === 'left-only' ? 'bg-red-50 dark:bg-red-900/30' : r.type === 'right-only' ? 'bg-green-50 dark:bg-green-900/30' : '';
              const isLinked = linkedRow === idx;
              // Use inset ring + higher z-index + hide default bottom border for consistent full outline
              const highlight = isLinked ? 'ring-2 ring-inset ring-amber-400 dark:ring-amber-500 shadow-inner z-10 border-b-transparent' : '';
              return (
                <div
                  key={idx}
                  id={`line-${idx + 1}`}
                  className={`group flex border-b border-gray-100 dark:border-gray-800 ${zebra} min-w-full relative scroll-mt-20 ${highlight}`}
                >
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-1 flex gap-1">
                    <button
                      onClick={() => copyPair(r, idx)}
                      title="Copy removed (red) and added (green) content for this row"
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500 text-white shadow hover:bg-blue-600 focus:outline-none focus:ring flex items-center gap-1"
                    >
                      {copiedRow === idx ? (
                        <span className="flex items-center gap-1"><span className="inline-block">✅</span><span>Copied</span></span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path d="M6 2a2 2 0 00-2 2v9h2V4h7V2H6z" />
                            <path d="M8 6a2 2 0 012-2h6a2 2 0 012 2v10a2 2 0 01-2 2h-6a2 2 0 01-2-2V6z" />
                          </svg>
                          <span>Copy</span>
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => linkToLine(idx)}
                      title="Get shareable link to this line (copies URL)"
                      className={`text-[10px] px-1.5 py-0.5 rounded bg-amber-500 text-white shadow hover:bg-amber-600 focus:outline-none focus:ring flex items-center gap-1 ${isLinked ? 'ring-2 ring-offset-1 ring-amber-300 dark:ring-offset-gray-900' : ''}`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10 13a5 5 0 007.54.54l1.92-1.92a5 5 0 00-7.07-7.07L11 6" />
                        <path d="M14 11a5 5 0 00-7.54-.54L4.54 12.38a5 5 0 007.07 7.07L13 18" />
                      </svg>
                      <span>Link</span>
                    </button>
                  </div>
                  <pre className={`m-0 w-1/2 whitespace-pre-wrap break-words px-2 py-0.5 ${r.type === 'left-only' ? diffBg : ''}`}>
                    {r.type === 'modified' ? (
                      r.leftTokens.map((t, i2) => (
                        <span
                          key={i2}
                          className={
                            t.type === 'remove'
                              ? 'bg-red-200/70 dark:bg-red-900/60 text-red-800 dark:text-red-200 rounded-sm'
                              : ''
                          }
                        >
                          {t.text}
                        </span>
                      ))
                    ) : (
                      r.left === '' ? '\u00A0' : r.left
                    )}
                  </pre>
                  <pre className={`m-0 w-1/2 whitespace-pre-wrap break-words px-2 py-0.5 border-l border-gray-200 dark:border-gray-700 ${r.type === 'right-only' ? diffBg : ''}`}>
                    {r.type === 'modified' ? (
                      r.rightTokens.map((t, i2) => (
                        <span
                          key={i2}
                          className={
                            t.type === 'add'
                              ? 'bg-green-200/70 dark:bg-green-900/60 text-green-800 dark:text-green-200 rounded-sm'
                              : ''
                          }
                        >
                          {t.text}
                        </span>
                      ))
                    ) : (
                      r.right === '' ? '\u00A0' : r.right
                    )}
                  </pre>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
