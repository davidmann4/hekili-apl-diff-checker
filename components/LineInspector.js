"use client";
import { useMemo, useState, useCallback } from 'react';

// Utility: split an if= expression into individual conditions joined by & (respecting parentheses)
function splitConditions(expr) {
  if (!expr) return [];
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === '&' && depth === 0) { // boundary
      out.push(expr.slice(start, i).trim());
      start = i + 1; // skip &
    }
  }
  const tail = expr.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

// Basic parser for an action line: actions.<list>(+=|=)/<action>,param=value,param2=value2,if=cond1&cond2
function parseLine(line) {
  if (!line) return null;
  const original = line;
  line = line.trim();
  // Strip comments after # (unless escaped) - simplistic
  const hashIdx = line.indexOf('#');
  if (hashIdx !== -1) line = line.slice(0, hashIdx).trim();
  const m = line.match(/^actions\.([A-Za-z0-9_]+)(?:\s*\+=|=)\/?([A-Za-z0-9_]+)(.*)$/);
  if (!m) {
    return { original, list: null, action: null, params: {}, ifParts: [] };
  }
  const list = m[1];
  const action = m[2];
  const rest = m[3] || '';
  const params = {};
  if (rest.startsWith(',')) {
    const paramStr = rest.slice(1); // drop leading comma
    // Split on commas not inside parentheses
    let depth = 0, start = 0;
    const parts = [];
    for (let i = 0; i < paramStr.length; i++) {
      const c = paramStr[i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === ',' && depth === 0) {
        parts.push(paramStr.slice(start, i));
        start = i + 1;
      }
    }
    const last = paramStr.slice(start);
    if (last) parts.push(last);
    parts.forEach(p => {
      const seg = p.trim();
      if (!seg) return;
      const eq = seg.indexOf('=');
      if (eq !== -1) {
        const key = seg.slice(0, eq).trim();
        const val = seg.slice(eq + 1).trim();
        if (key === 'if') {
          params[key] = val; // store full expression too
        } else {
          params[key] = val;
        }
      } else {
        // flag without value
        params[seg] = true;
      }
    });
  }
  const ifExpr = params.if || '';
  const ifParts = splitConditions(ifExpr);
  return { original, list, action, params, ifParts };
}

// Compare arrays of conditions; return objects with presence info
function diffConditionArrays(leftConds, rightConds) {
  const setL = new Set(leftConds);
  const setR = new Set(rightConds);
  const all = Array.from(new Set([...leftConds, ...rightConds]));
  return all.map(c => ({
    text: c,
    inLeft: setL.has(c),
    inRight: setR.has(c),
    status: setL.has(c) && setR.has(c) ? 'both' : setL.has(c) ? 'left' : 'right'
  }));
}

// Pretty print an if= expression into indented lines.
function prettyPrintConditions(expr) {
  if (!expr) return [];
  const lines = [];
  let indent = 0;
  let buf = '';
  const pushBuf = () => {
    const t = buf.trim();
    if (t) lines.push(' '.repeat(indent * 2) + t);
    buf = '';
  };
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') {
      if (buf.trim()) pushBuf();
      lines.push(' '.repeat(indent * 2) + '(');
      indent++;
    } else if (c === ')') {
      if (buf.trim()) pushBuf();
      indent = Math.max(0, indent - 1);
      lines.push(' '.repeat(indent * 2) + ')');
    } else if (c === '&' || c === '|') {
      // operator attaches to previous token
      const t = buf.trim();
      if (t) {
        lines.push(' '.repeat(indent * 2) + t + ' ' + c);
        buf = '';
      } else {
        // stray operator; put alone
        lines.push(' '.repeat(indent * 2) + c);
      }
    } else {
      buf += c;
    }
  }
  if (buf.trim()) pushBuf();
  return lines.filter(l => l.trim().length > 0);
}

export default function LineInspector({ open, onClose, leftLine, rightLine, rowType, index }) {
  const parsed = useMemo(() => ({
    left: parseLine(leftLine),
    right: parseLine(rightLine)
  }), [leftLine, rightLine]);

  // Shared variable values (across both sides).
  const [values, setValues] = useState({});

  // Expression parsing & evaluation helpers (minimal logical evaluator for &, |, and parentheses)
  function tokenizeExpr(expr) {
    const tokens = [];
    let buf = '';
    const flush = () => { if (buf.trim()) { tokens.push({ type: 'cond', value: buf.trim() }); buf = ''; } };
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '&' || c === '|' || c === '(' || c === ')') {
        flush();
        tokens.push({ type: c });
      } else {
        buf += c;
      }
    }
    flush();
    return tokens;
  }

  function parseExpression(expr) {
    const tokens = tokenizeExpr(expr);
    let pos = 0;
    function peek() { return tokens[pos]; }
    function consume() { return tokens[pos++]; }
    function parsePrimary() {
      const t = peek();
      if (!t) return null;
      if (t.type === '(') { consume(); const node = parseOr(); if (peek() && peek().type === ')') consume(); return node; }
      if (t.type === 'cond') { consume(); return buildCondNode(t.value); }
      return null;
    }
    function parseAnd() {
      let node = parsePrimary();
      while (peek() && peek().type === '&') { consume(); const rhs = parsePrimary(); node = { kind: 'and', left: node, right: rhs }; }
      return node;
    }
    function parseOr() {
      let node = parseAnd();
      while (peek() && peek().type === '|') { consume(); const rhs = parseAnd(); node = { kind: 'or', left: node, right: rhs }; }
      return node;
    }
    return parseOr();
  }

  function evalAst(ast, varValues, resultMap, nextIdRef) {
    if (!ast) return 0;
    let id = nextIdRef.current++;
    let out;
    if (ast.kind === 'cond') {
      let bool = 0;
      let leftVal;
      if (ast.operator) {
        const lhs = varValues[ast.variable] === undefined ? 0 : Number(varValues[ast.variable]) || 0;
        leftVal = lhs;
        let rhsVal;
        if (ast.rhsIsNumber) rhsVal = ast.rhsNumber; else rhsVal = varValues[ast.rhsVar] === undefined ? 0 : Number(varValues[ast.rhsVar]) || 0;
        switch (ast.operator) {
          case '>': bool = lhs > rhsVal ? 1 : 0; break;
          case '>=': bool = lhs >= rhsVal ? 1 : 0; break;
          case '<': bool = lhs < rhsVal ? 1 : 0; break;
          case '<=': bool = lhs <= rhsVal ? 1 : 0; break;
          case '!=': bool = lhs != rhsVal ? 1 : 0; break; // eslint-disable-line eqeqeq
          case '==':
          case '=': bool = lhs == rhsVal ? 1 : 0; break; // eslint-disable-line eqeqeq
          default: bool = 0;
        }
      } else {
        const raw = varValues[ast.variable];
        const num = raw === undefined ? 0 : Number(raw) || 0;
        leftVal = num;
        bool = num !== 0 ? 1 : 0;
      }
      out = bool;
      resultMap[id] = { type: 'cond', expr: ast.raw, variable: ast.variable, operator: ast.operator, rhs: ast.rhsRaw, lhs: leftVal, bool: out };
      return out;
    }
    const l = evalAst(ast.left, varValues, resultMap, nextIdRef);
    const r = evalAst(ast.right, varValues, resultMap, nextIdRef);
    if (ast.kind === 'and') out = (l && r) ? 1 : 0; else if (ast.kind === 'or') out = (l || r) ? 1 : 0; else out = 0;
    resultMap[id] = { type: ast.kind, bool: out };
    return out;
  }

  function evaluate(expr, varValues) {
    const ast = parseExpression(expr);
    const resultMap = {};
    const nextIdRef = { current: 1 };
    const final = evalAst(ast, varValues, resultMap, nextIdRef);
    return { final, ast, resultMap };
  }

  // Group (parentheses) evaluation: map closing index order to value.
  function evaluateGroups(expr, varValues) {
    const groups = [];
    const stack = [];
    for (let i = 0; i < expr.length; i++) {
      const c = expr[i];
      if (c === '(') stack.push(i);
      else if (c === ')' && stack.length) {
        const start = stack.pop();
        const inner = expr.slice(start + 1, i);
        const { final } = evaluate(inner, varValues);
        groups.push(final);
      }
    }
    return groups; // in order of closing parens encountered
  }
  function buildCondNode(raw) {
    const m = raw.match(/^(.*?)\s*(>=|<=|==|!=|=|>|<)\s*(.*?)$/);
    if (m) {
      const variable = m[1].trim();
      const operator = m[2];
      const rhsRaw = m[3].trim();
      const rhsNumber = Number(rhsRaw);
      const rhsIsNumber = !isNaN(rhsNumber) && rhsRaw !== '';
      return { kind: 'cond', raw, variable, operator, rhsRaw, rhsIsNumber, rhsNumber, rhsVar: rhsIsNumber ? null : rhsRaw };
    }
    // treat whole raw as variable name
    return { kind: 'cond', raw, variable: raw, operator: null };
  }

  const setValueFor = useCallback((variable) => {
    const existing = values[variable];
    const entered = window.prompt(`Set numeric value for: ${variable}\n(0 = false, non-zero = true)`, existing === undefined ? '' : existing);
    if (entered === null) return;
    const num = Number(entered);
    if (isNaN(num)) return;
    setValues(v => ({ ...v, [variable]: num }));
  }, [values]);

  // Tokenize utilities (duplicated from comparison for isolation)
  function tokenize(line) {
    if (!line) return [];
    const regex = /(\s+|[A-Za-z0-9_\.]+|[^A-Za-z0-9_\s])/g;
    const tokens = [];
    let m;
    while ((m = regex.exec(line)) !== null) tokens.push(m[0]);
    return tokens;
  }

  function diffTokensLocal(a, b) {
    const left = tokenize(a);
    const right = tokenize(b);
    const n = left.length, m = right.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (left[i] === right[j]) dp[i][j] = 1 + dp[i + 1][j + 1]; else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const leftOut = []; const rightOut = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (left[i] === right[j]) { leftOut.push({ text: left[i], type: 'same' }); rightOut.push({ text: right[j], type: 'same' }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { leftOut.push({ text: left[i], type: left[i].trim() ? 'remove' : 'same' }); i++; }
      else { rightOut.push({ text: right[j], type: right[j].trim() ? 'add' : 'same' }); j++; }
    }
    while (i < n) { leftOut.push({ text: left[i], type: left[i].trim() ? 'remove' : 'same' }); i++; }
    while (j < m) { rightOut.push({ text: right[j], type: right[j].trim() ? 'add' : 'same' }); j++; }
    return { leftTokens: leftOut, rightTokens: rightOut };
  }

  const tokenDiff = useMemo(() => {
    if (rowType === 'left-only' && leftLine) {
      return { leftTokens: tokenize(leftLine).map(t => ({ text: t, type: t.trim() ? 'remove' : 'same' })), rightTokens: [] };
    }
    if (rowType === 'right-only' && rightLine) {
      return { leftTokens: [], rightTokens: tokenize(rightLine).map(t => ({ text: t, type: t.trim() ? 'add' : 'same' })) };
    }
    if (leftLine && rightLine && (rowType === 'modified' || rowType === 'same')) {
      return diffTokensLocal(leftLine, rightLine);
    }
    return { leftTokens: [], rightTokens: [] };
  }, [leftLine, rightLine, rowType]);

  function extractExpr(side) {
    if (!side) return '';
    if (side.params?.if) return side.params.if;
    // For variable set lines or value expressions containing logical operators
    const val = side.params?.value;
    if (typeof val === 'string' && /[&|()]/.test(val)) return val;
    return '';
  }
  const leftExpr = extractExpr(parsed.left);
  const rightExpr = extractExpr(parsed.right);
  const leftPretty = useMemo(() => prettyPrintConditions(leftExpr), [leftExpr]);
  const rightPretty = useMemo(() => prettyPrintConditions(rightExpr), [rightExpr]);
  const leftSet = useMemo(() => new Set(leftPretty.map(l => l.trim())), [leftPretty]);
  const rightSet = useMemo(() => new Set(rightPretty.map(l => l.trim())), [rightPretty]);

  const leftEval = useMemo(() => leftExpr ? evaluate(leftExpr, values) : null, [leftExpr, values]);
  const rightEval = useMemo(() => rightExpr ? evaluate(rightExpr, values) : null, [rightExpr, values]);
  const leftGroupVals = useMemo(() => leftExpr ? evaluateGroups(leftExpr, values) : [], [leftExpr, values]);
  const rightGroupVals = useMemo(() => rightExpr ? evaluateGroups(rightExpr, values) : [], [rightExpr, values]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 m-4 flex-1 overflow-hidden rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
          <h2 className="text-sm font-semibold">Inspect Line #{index + 1} <span className="ml-2 text-xs font-normal text-gray-500">({rowType})</span></h2>
          <button onClick={() => {
            // Clear #inspect-N hash if present so link can be re-copied later without confusion.
            if (typeof window !== 'undefined' && window.location.hash.startsWith('#inspect-')) {
              if (history && history.replaceState) {
                history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
              } else {
                window.location.hash = '';
              }
            }
            onClose();
          }} className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600">Close</button>
        </div>
        <div className="flex-1 overflow-auto">
          <section className="p-3 space-y-3">
            <div>
              <div className="text-xs font-semibold mb-1">Raw Lines (inline diff)</div>
              {/* Column labels for clarity */}
              <div className="grid grid-cols-2 gap-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <div className="text-left">SimC</div>
                <div className="text-left">Hekili</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <pre className="p-2 rounded bg-gray-100 dark:bg-gray-900 whitespace-pre-wrap break-words min-h-[2.5rem] border border-gray-200 dark:border-gray-800">
                  {tokenDiff.leftTokens.length === 0 && !leftLine && <span className="italic opacity-50">(none)</span>}
                  {tokenDiff.leftTokens.map((t,i)=>(
                    <span key={i} className={t.type === 'remove' ? 'bg-red-300 dark:bg-red-800 text-red-900 dark:text-red-100 rounded-sm' : ''}>{t.text}</span>
                  ))}
                </pre>
                <pre className="p-2 rounded bg-gray-100 dark:bg-gray-900 whitespace-pre-wrap break-words min-h-[2.5rem] border border-gray-200 dark:border-gray-800">
                  {tokenDiff.rightTokens.length === 0 && !rightLine && <span className="italic opacity-50">(none)</span>}
                  {tokenDiff.rightTokens.map((t,i)=>(
                    <span key={i} className={t.type === 'add' ? 'bg-green-300 dark:bg-green-800 text-green-900 dark:text-green-100 rounded-sm' : ''}>{t.text}</span>
                  ))}
                </pre>
              </div>
            </div>
      {(leftExpr || rightExpr) && (
              <div>
        <div className="text-xs font-semibold mb-1 flex items-center gap-2">Pretty Conditions {parsed.left?.params?.if || parsed.right?.params?.if ? '(if=)' : '(value= expression)'}
                  <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400">Operators end their line; indentation reflects parentheses.</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-[11px] font-mono">
                  <div className="border rounded border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-2 overflow-auto max-h-[60vh] flex flex-col gap-0.5">
                    <div className="text-[10px] mb-1 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">SimC Result: {leftEval ? leftEval.final : '—'}</div>
                    {leftPretty.length === 0 && <div className="italic opacity-50">(no conditions)</div>}
                    {leftPretty.length > 0 && leftExpr && (
                      <PrettyInteractive
                        side="left"
                        prettyLines={leftPretty}
                        sharedSet={rightSet}
                        values={values}
                        setValueFor={setValueFor}
                        groupValues={leftGroupVals}
                      />
                    )}
                  </div>
                  <div className="border rounded border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-2 overflow-auto max-h-[60vh] flex flex-col gap-0.5">
                    <div className="text-[10px] mb-1 font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Hekili Result: {rightEval ? rightEval.final : '—'}</div>
                    {rightPretty.length === 0 && <div className="italic opacity-50">(no conditions)</div>}
                    {rightPretty.length > 0 && rightExpr && (
                      <PrettyInteractive
                        side="right"
                        prettyLines={rightPretty}
                        sharedSet={leftSet}
                        values={values}
                        setValueFor={setValueFor}
                        groupValues={rightGroupVals}
                      />
                    )}
                  </div>
                </div>
                {/* Legend removed as requested */}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Subcomponent: renders pretty lines with interactive value setting & group evaluation.
function PrettyInteractive({ side, prettyLines, sharedSet, values, setValueFor, groupValues }) {
  // Track index of closing paren to attach group evaluation
  let closeIndex = 0;
  return (
    <div className="space-y-0.5">
      {prettyLines.map((ln,i)=>{
        const trimmed = ln.trim();
        const isOpen = trimmed === '(';
        const isClose = trimmed === ')';
        const endsWithOp = /[&|]$/.test(trimmed) && !isOpen && !isClose;
        let conditionText = null;
        let variable = null; let operator = null; let rhsRaw = null; let rhsIsNumber = false; let rhsNumber = 0; let rhsVar = null;
        if (!isOpen && !isClose) {
          conditionText = trimmed.replace(/[&|]$/,'').trim();
          const m = conditionText.match(/^(.*?)\s*(>=|<=|==|!=|=|>|<)\s*(.*?)$/);
          if (m) {
            variable = m[1].trim(); operator = m[2]; rhsRaw = m[3].trim();
            const num = Number(rhsRaw); rhsIsNumber = !isNaN(num) && rhsRaw !== ''; rhsNumber = num; if (!rhsIsNumber) rhsVar = rhsRaw;
          } else {
            variable = conditionText; // boolean style variable
          }
        }
        const shared = sharedSet.has(trimmed);
        const clickable = !!variable;
        const variableVal = variable ? (values[variable] !== undefined ? values[variable] : 0) : null;
        let rhsVal = null; if (operator) { rhsVal = rhsIsNumber ? rhsNumber : (values[rhsVar] !== undefined ? values[rhsVar] : 0); }
        let evalBool = null;
        if (variable) {
          if (!operator) evalBool = variableVal !== 0 ? 1 : 0; else {
            switch (operator) {
              case '>': evalBool = variableVal > rhsVal ? 1 : 0; break;
              case '>=': evalBool = variableVal >= rhsVal ? 1 : 0; break;
              case '<': evalBool = variableVal < rhsVal ? 1 : 0; break;
              case '<=': evalBool = variableVal <= rhsVal ? 1 : 0; break;
              case '!=': evalBool = variableVal != rhsVal ? 1 : 0; break; // eslint-disable-line eqeqeq
              case '==':
              case '=': evalBool = variableVal == rhsVal ? 1 : 0; break; // eslint-disable-line eqeqeq
              default: evalBool = 0;
            }
          }
        }
        let groupVal = null;
        if (isClose && closeIndex < groupValues.length) {
          groupVal = groupValues[closeIndex++];
        }
        return (
          <div key={i} className={`flex items-center justify-between gap-2 group rounded-sm px-1 py-0.5 ${!shared && !isOpen && !isClose ? (side==='left' ? 'bg-red-300 dark:bg-red-800 text-red-900 dark:text-red-100' : 'bg-green-300 dark:bg-green-800 text-green-900 dark:text-green-100') : ''}`}>
            <div
              className={`flex-1 whitespace-pre break-words cursor-${clickable ? 'pointer' : 'default'} ${clickable ? 'hover:underline' : ''}`}
              onClick={()=> clickable && setValueFor(variable)}
              title={clickable ? `Click to set value for ${variable}` : ''}
            >{ln}</div>
            {variable && (
              <div className="flex items-center gap-1">
                <div className="text-[10px] font-mono px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 min-w-[2rem] text-center" title={`Value of ${variable}`}>{variableVal}</div>
                {operator && (
                  <div className={`text-[10px] font-mono px-1 py-0.5 rounded min-w-[1.5rem] text-center ${evalBool === 1 ? 'bg-blue-300 dark:bg-blue-700 text-blue-900 dark:text-blue-100' : 'bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100'}`} title="Evaluation result (1=true,0=false)">{evalBool}</div>
                )}
                {!operator && (
                  <div className={`text-[10px] font-mono px-1 py-0.5 rounded min-w-[1.5rem] text-center ${evalBool === 1 ? 'bg-blue-300 dark:bg-blue-700 text-blue-900 dark:text-blue-100' : 'bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100'}`} title="Boolean result from variable value">{evalBool}</div>
                )}
              </div>
            )}
            {groupVal !== null && (
              <div className="text-[10px] font-mono px-1 py-0.5 rounded bg-blue-200 dark:bg-blue-800 text-blue-900 dark:text-blue-100 min-w-[2rem] text-center" title="Group boolean evaluation">{groupVal}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
