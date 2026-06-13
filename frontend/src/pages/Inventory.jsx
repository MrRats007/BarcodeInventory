import { useEffect, useRef, useState } from 'react';
import api from '../api';

let BrowserMultiFormatReader;

// ── Barcode-based Add Stock panel ────────────────────────────────────────────
function AddByBarcode({ onAdded }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);

  const [scanMode, setScanMode] = useState('manual'); // 'manual' | 'camera'
  const [input, setInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);

  const [state, setState] = useState('idle'); // idle | found | processing | success | not_found
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    if (readerRef.current) { try { readerRef.current.reset(); } catch {} readerRef.current = null; }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false); setScanning(false);
  }

  async function startCamera() {
    setCameraError(''); setScanning(true);
    try {
      if (!BrowserMultiFormatReader) {
        const mod = await import('@zxing/browser');
        BrowserMultiFormatReader = mod.BrowserMultiFormatReader;
      }
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      if (!devices?.length) { setCameraError('No camera found.'); setScanning(false); return; }
      const cam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[0];
      setCameraActive(true);
      reader.decodeFromVideoDevice(cam.deviceId, videoRef.current, (result) => {
        if (result) { stopCamera(); lookupBarcode(result.getText()); }
      });
    } catch (err) {
      setCameraError(err.name === 'NotAllowedError' ? 'Camera permission denied.' : 'Could not start camera: ' + err.message);
      setScanning(false); setCameraActive(false);
    }
  }

  async function lookupBarcode(barcode) {
    const code = barcode.trim().toUpperCase();
    if (!code) return;
    setProduct(null); setMessage(''); setQty('1'); setNotes(''); setState('idle');
    try {
      const { data } = await api.get(`/scan/lookup/${code}`);
      setProduct(data); setState('found');
    } catch {
      setState('not_found'); setMessage(code);
    }
  }

  async function handleAdd() {
    const q = parseInt(qty);
    if (!q || q <= 0) return;
    setState('processing');
    try {
      const { data } = await api.post('/scan/process', {
        barcode: product.barcode,
        quantity: q,
        notes: notes.trim() || 'Barcode scan',
        action: 'add',
      });
      setState('success');
      setMessage(`Added ${data.changedQuantity} unit${data.changedQuantity !== 1 ? 's' : ''} to "${data.product.name}". Now ${data.remainingQuantity} in stock.`);
      onAdded();
      setInput('');
    } catch (err) {
      setState('found'); // revert so user can retry
      setMessage(err.response?.data?.error || 'Failed to add stock');
    }
  }

  function reset() {
    setState('idle'); setProduct(null); setMessage(''); setInput(''); setQty('1'); setNotes('');
  }

  return (
    <div className="card p-4 mb-5">
      <p className="text-sm font-medium text-gray-700 mb-3">Add stock by barcode</p>

      {/* Scan mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg w-fit mb-3">
        {[{ key: 'manual', label: 'Manual' }, { key: 'camera', label: 'Camera' }].map(({ key, label }) => (
          <button key={key}
            onClick={() => { if (scanMode === 'camera' && key !== 'camera') stopCamera(); setScanMode(key); reset(); }}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              scanMode === key ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Manual input */}
      {scanMode === 'manual' && state === 'idle' && (
        <form onSubmit={e => { e.preventDefault(); lookupBarcode(input); }} className="flex gap-2">
          <input type="text" className="input flex-1 font-mono uppercase tracking-widest text-sm"
            placeholder="Scan or type barcode…"
            value={input} onChange={e => setInput(e.target.value.toUpperCase())} autoFocus />
          <button type="submit" className="btn-primary btn-sm">Find</button>
        </form>
      )}

      {/* Camera */}
      {scanMode === 'camera' && state === 'idle' && (
        <div>
          {cameraError && (
            <p className="text-xs text-red-500 mb-2">{cameraError}</p>
          )}
          <div className="relative bg-gray-900 rounded-lg overflow-hidden aspect-video mb-2"
            style={{ maxHeight: 180 }}>
            <video ref={videoRef} className="w-full h-full object-cover"
              style={{ display: cameraActive ? 'block' : 'none' }} muted playsInline />
            {!cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
                Camera preview
              </div>
            )}
            {cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-40 h-16 border border-white/50 rounded" />
              </div>
            )}
          </div>
          {!cameraActive
            ? <button onClick={startCamera} disabled={scanning} className="btn-primary btn-sm">
                {scanning ? 'Starting…' : 'Start Camera'}
              </button>
            : <button onClick={stopCamera} className="btn-secondary btn-sm">Stop</button>
          }
        </div>
      )}

      {/* Not found */}
      {state === 'not_found' && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg">
          <p className="text-sm text-red-600">
            <span className="font-mono font-medium">{message}</span> — not found in inventory
          </p>
          <button onClick={reset} className="btn-secondary btn-sm flex-shrink-0">Clear</button>
        </div>
      )}

      {/* Found — add form */}
      {(state === 'found' || state === 'processing') && product && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{product.name}</p>
              <p className="text-xs text-gray-400 truncate">{product.path}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400">Stock</p>
              <p className="text-lg font-semibold text-gray-800">{product.quantity}</p>
            </div>
          </div>
          {message && <p className="text-xs text-red-500">{message}</p>}
          <div className="flex gap-2">
            <input type="number" min="1" className="input w-24 text-sm" placeholder="Qty"
              value={qty} onChange={e => setQty(e.target.value)} autoFocus />
            <input type="text" className="input flex-1 text-sm" placeholder="Notes (optional)"
              value={notes} onChange={e => setNotes(e.target.value)} />
            <button onClick={handleAdd} disabled={state === 'processing'} className="btn-success btn-sm flex-shrink-0">
              {state === 'processing' ? 'Adding…' : '+ Add'}
            </button>
            <button onClick={reset} className="btn-secondary btn-sm flex-shrink-0">Cancel</button>
          </div>
        </div>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
          <p className="text-sm text-emerald-700">{message}</p>
          <button onClick={reset} className="btn-secondary btn-sm flex-shrink-0">Add more</button>
        </div>
      )}
    </div>
  );
}

// ── Manual stock modal (for table row button) ────────────────────────────────
function StockModal({ item, onClose, onSuccess }) {
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(type) {
    const q = parseInt(qty);
    if (!q || q <= 0) return setError('Enter a valid quantity');
    setLoading(true); setError('');
    try {
      await api.post(`/inventory/${type}`, { branchId: item.id, quantity: q, notes });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-100 rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-800">Update Stock</p>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-400 truncate">{item.path}</p>
            <p className="text-sm font-medium text-gray-800 mt-0.5">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">Current stock: <span className="font-medium text-gray-700">{item.quantity}</span></p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Quantity</label>
            <input type="number" min="1" className="input" value={qty}
              onChange={e => setQty(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Notes <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input type="text" className="input" placeholder="e.g. Restocking"
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => submit('add')} disabled={loading}
              className="btn-success flex-1 justify-center">+ Add</button>
            <button onClick={() => submit('remove')} disabled={loading}
              className="btn-danger flex-1 justify-center">− Remove</button>
            <button onClick={onClose} className="btn-secondary px-3">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',     label: 'All' },
  { key: 'instock', label: 'In Stock' },
  { key: 'low',     label: 'Low (≤5)' },
  { key: 'empty',   label: 'Empty' },
];

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  function load() {
    setLoading(true);
    api.get('/inventory').then(r => setItems(r.data)).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const filtered = items.filter(item => {
    const matchSearch = !search || item.path.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all'     ? true :
      filter === 'instock' ? item.quantity > 0 :
      filter === 'low'     ? item.quantity > 0 && item.quantity <= 5 :
      filter === 'empty'   ? item.quantity === 0 : true;
    return matchSearch && matchFilter;
  });

  const totalStock = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
        <p className="text-sm text-gray-400 mt-0.5">{items.length} products · {totalStock} units total</p>
      </div>

      {/* Barcode add panel */}
      <AddByBarcode onAdded={load} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input type="text" placeholder="Search products…" className="input sm:max-w-xs"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-gray-400">
          {search ? 'No products match your search' : 'No products yet — add categories in Products.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">Barcode</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">Stock</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-800">{item.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{item.path}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                        {item.barcode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`badge ${item.quantity === 0 ? 'badge-red' : item.quantity <= 5 ? 'badge-yellow' : 'badge-green'}`}>
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => setSelected(item)} className="btn-secondary btn-sm">Update</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="space-y-2 md:hidden">
            {filtered.map(item => (
              <div key={item.id} className="card px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{item.path}</p>
                  <p className="text-xs font-mono text-gray-300 mt-0.5">{item.barcode}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`badge ${item.quantity === 0 ? 'badge-red' : item.quantity <= 5 ? 'badge-yellow' : 'badge-green'}`}>
                    {item.quantity}
                  </span>
                  <button onClick={() => setSelected(item)} className="btn-secondary btn-sm">Update</button>
                </div>
              </div>
            ))}
          </div>
        </>

      )}

      {selected && (
        <StockModal
          item={selected}
          onClose={() => setSelected(null)}
          onSuccess={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
