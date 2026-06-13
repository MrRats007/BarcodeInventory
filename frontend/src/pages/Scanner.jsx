import { useEffect, useRef, useState } from 'react';
import api from '../api';

let BrowserMultiFormatReader;

export default function Scanner() {
  const videoRef = useRef(null);
  const readerRef = useRef(null);

  const [mode, setMode] = useState('manual');
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);

  // One state machine: idle → found | not_found | success | error
  const [state, setState] = useState('idle'); // 'idle' | 'found' | 'not_found' | 'processing' | 'success' | 'error'
  const [product, setProduct] = useState(null);
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => () => stopCamera(), []);

  function stopCamera() {
    if (readerRef.current) { try { readerRef.current.reset(); } catch {} readerRef.current = null; }
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setScanning(false);
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
      setCameraError(err.name === 'NotAllowedError'
        ? 'Camera permission denied.'
        : 'Could not start camera: ' + err.message);
      setScanning(false); setCameraActive(false);
    }
  }

  async function lookupBarcode(barcode) {
    const code = barcode.trim().toUpperCase();
    if (!code) return;
    setProduct(null); setMessage(''); setNotes(''); setState('idle');
    try {
      const { data } = await api.get(`/scan/lookup/${code}`);
      setProduct(data);
      setState('found');
    } catch {
      setState('not_found');
      setMessage(barcode.trim().toUpperCase());
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    lookupBarcode(manualInput);
  }

  async function handleSell() {
    setState('processing');
    try {
      const { data } = await api.post('/scan/process', {
        barcode: product.barcode,
        quantity: 1,
        notes: notes.trim() || 'Barcode scan',
        action: 'remove',
      });
      setState('success');
      setMessage(`Removed 1 unit of "${data.product.name}". ${data.remainingQuantity} remaining.`);
      setManualInput('');
    } catch (err) {
      setState('error');
      setMessage(err.response?.data?.error || 'Failed to process');
    }
  }

  function reset() {
    setState('idle'); setProduct(null); setMessage(''); setManualInput(''); setNotes('');
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Scanner</h1>
        <p className="text-sm text-gray-400 mt-0.5">Scan a barcode to mark an item as sold</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
        {[{ key: 'manual', label: 'Manual' }, { key: 'camera', label: 'Camera' }].map(({ key, label }) => (
          <button key={key}
            onClick={() => { if (mode === 'camera' && key !== 'camera') stopCamera(); setMode(key); reset(); }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mode === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Manual input */}
      {mode === 'manual' && state === 'idle' && (
        <div className="card p-4 mb-4">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input type="text" className="input flex-1 font-mono uppercase tracking-widest"
              placeholder="e.g. INVAB12CD34"
              value={manualInput}
              onChange={e => setManualInput(e.target.value.toUpperCase())}
              autoFocus />
            <button type="submit" className="btn-primary">Look up</button>
          </form>
        </div>
      )}

      {/* Camera */}
      {mode === 'camera' && state === 'idle' && (
        <div className="card p-4 mb-4">
          {cameraError && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
              {cameraError}
            </div>
          )}
          <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-video mb-3">
            <video ref={videoRef} className="w-full h-full object-cover"
              style={{ display: cameraActive ? 'block' : 'none' }} muted playsInline />
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-500">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-xs">Camera preview</p>
              </div>
            )}
            {cameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-52 h-24 border border-white/50 rounded-lg" />
              </div>
            )}
          </div>
          {!cameraActive
            ? <button onClick={startCamera} disabled={scanning} className="btn-primary w-full justify-center">
                {scanning ? 'Starting…' : 'Start Camera'}
              </button>
            : <button onClick={stopCamera} className="btn-secondary w-full justify-center">Stop</button>
          }
          {cameraActive && <p className="text-xs text-gray-400 text-center mt-2">Point at a Code 128 barcode</p>}
        </div>
      )}

      {/* Not found */}
      {state === 'not_found' && (
        <div className="card p-4 border-red-100 bg-red-50">
          <div className="flex items-start gap-2.5 mb-3">
            <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-700">Product not found</p>
              <p className="text-xs text-red-500 mt-0.5 font-mono">{message}</p>
              <p className="text-xs text-red-400 mt-1">This barcode doesn't exist in your inventory.</p>
            </div>
          </div>
          <button onClick={reset} className="btn-secondary btn-sm">Try again</button>
        </div>
      )}

      {/* Found — confirm sell */}
      {(state === 'found' || state === 'processing') && product && (
        <div className="card p-4">
          <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
            <div className="min-w-0">
              <span className="badge badge-green mb-1.5">Product found</span>
              <p className="font-medium text-gray-900">{product.name}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{product.path}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-400 mb-0.5">In stock</p>
              <p className={`text-2xl font-semibold ${
                product.quantity === 0 ? 'text-red-500' :
                product.quantity <= 5  ? 'text-amber-500' : 'text-gray-900'
              }`}>{product.quantity}</p>
            </div>
          </div>

          {product.quantity === 0 ? (
            <div className="px-3 py-2.5 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 mb-3">
              Out of stock — nothing to remove.
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-3">
                This will remove <span className="font-semibold text-gray-800">1 unit</span> from inventory.
              </p>
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Notes <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input type="text" className="input" placeholder="e.g. Customer sale"
                  value={notes} onChange={e => setNotes(e.target.value)} autoFocus />
              </div>
              <div className="flex gap-2">
                <button onClick={handleSell} disabled={state === 'processing'}
                  className="btn-danger flex-1 justify-center">
                  {state === 'processing' ? 'Processing…' : 'Confirm — Mark as sold'}
                </button>
                <button onClick={reset} className="btn-secondary">Cancel</button>
              </div>
            </>
          )}
          {product.quantity === 0 && (
            <button onClick={reset} className="btn-secondary btn-sm mt-1">Back</button>
          )}
        </div>
      )}

      {/* Success */}
      {state === 'success' && (
        <div className="card p-4 border-emerald-100 bg-emerald-50">
          <div className="flex items-start gap-2.5 mb-3">
            <svg className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm text-emerald-700">{message}</p>
          </div>
          <button onClick={reset} className="btn-secondary btn-sm">Scan another</button>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="card p-4 border-red-100 bg-red-50">
          <p className="text-sm text-red-600 mb-3">{message}</p>
          <button onClick={reset} className="btn-secondary btn-sm">Try again</button>
        </div>
      )}
    </div>
  );
}
