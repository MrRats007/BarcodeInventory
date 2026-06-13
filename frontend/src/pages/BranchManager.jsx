import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import api from '../api';

// ─── Icons ────────────────────────────────────────────────────────────────────
const ChevronRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);
const TagIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);
const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);
const PrintIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

// ─── Client-side barcode renderer ─────────────────────────────────────────────
// Renders a scannable Code 128 barcode purely in the browser (no server call,
// no auth issues, works in print popups).
function BarcodeView({ value, width = 3, height = 90 }) {
  const svgRef = useRef(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,          // bar width in pixels — wider = easier to scan
        height,         // bar height in pixels
        displayValue: true,
        fontSize: 14,
        fontOptions: 'bold',
        margin: 12,
        background: '#ffffff',
        lineColor: '#000000',
      });
      setError(false);
    } catch (e) {
      console.error('Barcode error:', e);
      setError(true);
    }
  }, [value, width, height]);

  if (error) return <p className="text-sm text-red-500">Failed to render barcode</p>;
  return <svg ref={svgRef} />;
}

// ─── Barcode Panel (shown when inside a leaf node) ────────────────────────────
function BarcodePanel({ branch, onStockAdded }) {
  const svgContainerRef = useRef(null);
  const [addQty, setAddQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [quantity, setQuantity] = useState(branch.quantity ?? 0);
  const [showAdd, setShowAdd] = useState(false);

  // Sync quantity when branch prop changes (e.g. after navigating back & forth)
  useEffect(() => { setQuantity(branch.quantity ?? 0); }, [branch.id]);

  function handlePrint() {
    // Grab the rendered SVG markup and embed it directly in the print popup.
    // No network requests, no auth — works perfectly.
    const svgEl = svgContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    const svgHtml = svgEl.outerHTML;

    const w = window.open('', '_blank', 'width=500,height=420');
    w.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Label — ${branch.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff;
    }
    .label {
      border: 2px solid #111; border-radius: 10px;
      padding: 18px 24px; text-align: center;
      display: inline-flex; flex-direction: column; align-items: center; gap: 6px;
      min-width: 300px; max-width: 380px;
    }
    .path  { font-size: 9px;  color: #888; max-width: 320px; line-height: 1.5; word-break: break-word; }
    .name  { font-size: 17px; font-weight: 700; color: #111; }
    svg    { max-width: 320px; display: block; }
    @media print { @page { margin: 0.5cm; } }
  </style>
</head>
<body>
  <div class="label">
    <div class="path">${branch.path}</div>
    <div class="name">${branch.name}</div>
    ${svgHtml}
  </div>
  <script>window.onload = () => window.print();<\/script>
</body>
</html>`);
    w.document.close();
  }

  async function handleAddStock(e) {
    e.preventDefault();
    const q = parseInt(addQty);
    if (!q || q <= 0) return setAddError('Enter a valid quantity');
    setAdding(true); setAddError('');
    try {
      const { data } = await api.post('/inventory/add', { branchId: branch.id, quantity: q, notes });
      setQuantity(data.quantity);
      setAddQty('1'); setNotes(''); setShowAdd(false);
      onStockAdded?.();
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add stock');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-100 bg-white p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Product · barcode ready</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 items-start">

        {/* Barcode card */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 flex flex-col items-center gap-3 flex-shrink-0">
          <div ref={svgContainerRef} className="w-full">
            <BarcodeView value={branch.barcode} width={3} height={80} />
          </div>
          <button onClick={handlePrint} className="btn-primary btn-sm w-full justify-center">
            <PrintIcon /> Print Label
          </button>
        </div>

        {/* Stock & info */}
        <div className="flex-1 space-y-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Full path</p>
            <p className="text-sm text-gray-700 font-medium">{branch.path}</p>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Current stock</p>
            <p className={`text-3xl font-bold ${
              quantity === 0 ? 'text-red-500' : quantity <= 5 ? 'text-yellow-500' : 'text-emerald-700'
            }`}>
              {quantity}
              <span className="text-sm font-normal text-gray-400 ml-1">units</span>
            </p>
          </div>

          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} className="btn-success">
              <PlusIcon /> Add Stock
            </button>
          ) : (
            <form onSubmit={handleAddStock} className="space-y-2">
              {addError && <p className="text-sm text-red-600">{addError}</p>}
              <div className="flex gap-2">
                <input
                  type="number" min="1" required
                  className="input w-24"
                  placeholder="Qty"
                  value={addQty}
                  onChange={e => setAddQty(e.target.value)}
                  autoFocus
                />
                <input
                  type="text" className="input flex-1"
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={adding} className="btn-success btn-sm">
                  {adding ? 'Adding…' : 'Confirm'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-category row ─────────────────────────────────────────────────────────
function BranchRow({ branch, onNavigate, onDelete }) {
  const isLeaf = branch.child_count === 0;
  return (
    <div
      className="card flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors group"
      onClick={() => onNavigate(branch)}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
        isLeaf ? 'bg-gray-100' : 'bg-gray-100'
      }`}>
        {isLeaf
          ? <span className="text-gray-500"><TagIcon /></span>
          : <span className="text-gray-500"><FolderIcon /></span>
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{branch.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {isLeaf
            ? <span className="flex items-center gap-1.5">
                <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  branch.quantity === 0 ? 'bg-red-400' : branch.quantity <= 5 ? 'bg-yellow-400' : 'bg-emerald-400'
                }`} />
                {branch.quantity} in stock · <span className="font-mono">{branch.barcode}</span>
              </span>
            : `${branch.child_count} sub-categor${branch.child_count !== 1 ? 'ies' : 'y'} — click to open`
          }
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onDelete(branch)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete"
        >
          <TrashIcon />
        </button>
        <span className="text-gray-300"><ChevronRight /></span>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function BranchManager() {
  const [branches, setBranches] = useState([]);
  const [currentBranch, setCurrentBranch] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');
  const createInputRef = useRef(null);

  function loadChildren(parentId = null) {
    setLoading(true);
    setError('');
    const query = parentId ? `?parentId=${parentId}` : '';
    api.get(`/branches${query}`)
      .then(r => setBranches(r.data))
      .catch(() => setError('Failed to load categories'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadChildren(currentBranch?.id ?? null);
  }, [currentBranch]);

  function navigateInto(branch) {
    setBreadcrumbs(prev => [...prev, branch]);
    setCurrentBranch(branch);
    setShowCreate(false);
    setNewName('');
    setError('');
  }

  function navigateTo(index) {
    if (index === -1) {
      setBreadcrumbs([]);
      setCurrentBranch(null);
    } else {
      setBreadcrumbs(prev => prev.slice(0, index + 1));
      setCurrentBranch(breadcrumbs[index]);
    }
    setShowCreate(false);
    setNewName('');
    setError('');
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true); setError('');
    try {
      await api.post('/branches', {
        name: newName.trim(),
        parentId: currentBranch?.id ?? null,
      });
      setNewName('');
      setShowCreate(false);
      loadChildren(currentBranch?.id ?? null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(branch) {
    if (!window.confirm(`Delete "${branch.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/branches/${branch.id}`);
      loadChildren(currentBranch?.id ?? null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  }

  function openCreate() {
    setShowCreate(true);
    setError('');
    setTimeout(() => createInputRef.current?.focus(), 50);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Products</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Drill into categories — the deepest level gets a scannable barcode
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary flex-shrink-0">
          <PlusIcon />
          {currentBranch ? 'New Sub-Category' : 'New Category'}
        </button>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center flex-wrap gap-0.5 text-sm mb-5 bg-gray-50 border border-gray-100 px-2 py-1.5 rounded-xl">
        <button
          onClick={() => navigateTo(-1)}
          className={`px-2 py-1 rounded-md font-medium transition-colors ${
            !currentBranch ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-800 hover:bg-white'
          }`}
        >
          All Categories
        </button>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight />
            <button
              onClick={() => navigateTo(i)}
              className={`px-2 py-1 rounded-md font-medium transition-colors ${
                i === breadcrumbs.length - 1
                  ? 'bg-white shadow-sm text-blue-600'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-white'
              }`}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {/* Current location */}
      {currentBranch && (
        <div className="mb-5 px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl">
          <p className="text-xs text-gray-400 mb-0.5">Inside</p>
          <p className="text-sm font-medium text-gray-700">{currentBranch.path}</p>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="card p-3 mb-4 flex gap-2 border-blue-300 shadow-sm">
          <input
            ref={createInputRef}
            type="text" required
            className="input flex-1"
            placeholder={
              currentBranch
                ? `Sub-category name under "${currentBranch.name}"…`
                : 'Top-level category name…'
            }
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <button type="submit" disabled={creating} className="btn-primary">
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => { setShowCreate(false); setNewName(''); setError(''); }}
            className="btn-secondary">Cancel</button>
        </form>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Loading…</div>
      )}

      {/* Sub-category list */}
      {!loading && branches.length > 0 && (
        <div className="space-y-2">
          {branches.map(branch => (
            <BranchRow key={branch.id} branch={branch} onNavigate={navigateInto} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Inside a leaf: show barcode panel */}
      {!loading && branches.length === 0 && currentBranch && (
        <div>
          <BarcodePanel
            branch={currentBranch}
            onStockAdded={() => {
              api.get(`/branches/${currentBranch.id}`).then(r => setCurrentBranch(r.data));
            }}
          />
          <div className="mt-4 text-center">
            <p className="text-xs text-gray-400 mb-2">Need variants? Add sub-categories here.</p>
            {!showCreate && (
              <button onClick={openCreate} className="btn-secondary btn-sm">
                <PlusIcon /> Add Sub-Category
              </button>
            )}
          </div>
        </div>
      )}

      {/* Root empty state */}
      {!loading && branches.length === 0 && !currentBranch && (
        <div className="card p-14 text-center">
          <div className="text-5xl mb-3">📦</div>
          <p className="font-semibold text-gray-700 text-lg">No categories yet</p>
          <p className="text-sm text-gray-400 mt-2 max-w-sm mx-auto">
            Start with a top-level category like <strong>"Phones"</strong>, drill in to
            add sub-categories, and at the deepest level you'll get a scannable barcode.
          </p>
          <button onClick={openCreate} className="btn-primary mt-5">
            <PlusIcon /> Create First Category
          </button>
        </div>
      )}

      {/* Legend */}
      {!loading && (
        <div className="mt-6 flex items-center gap-5 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-100 inline-block" /> Category — click to drill in
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-emerald-100 inline-block" /> Product (leaf) — has barcode
          </span>
        </div>
      )}
    </div>
  );
}
