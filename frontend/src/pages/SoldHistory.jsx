import { useEffect, useState } from 'react';
import api from '../api';

function formatTime(dt) {
  return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDay(dt) {
  return new Date(dt).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function getMonthLabel(dt) {
  return new Date(dt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getDayKey(dt) {
  return new Date(dt).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function SoldHistory() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/inventory/history').then(r => setTransactions(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = transactions.filter(t => {
    const matchType = filter === 'all' ? true : t.type === filter;
    const matchSearch = !search || t.path.toLowerCase().includes(search.toLowerCase()) || t.name.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  // Group by month → day → transactions
  const grouped = {};
  filtered.forEach(t => {
    const month = getMonthLabel(t.created_at);
    const day = getDayKey(t.created_at);
    if (!grouped[month]) grouped[month] = {};
    if (!grouped[month][day]) grouped[month][day] = [];
    grouped[month][day].push(t);
  });

  const months = Object.keys(grouped);

  // Summary for filtered
  const totalAdded = filtered.filter(t => t.type === 'add').reduce((s, t) => s + t.quantity, 0);
  const totalRemoved = filtered.filter(t => t.type === 'remove').reduce((s, t) => s + t.quantity, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sold History</h1>
        <p className="text-gray-500 text-sm mt-0.5">All inventory movements, organized by date</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Transactions</p>
          <p className="text-2xl font-bold text-gray-800">{filtered.length}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Units Added</p>
          <p className="text-2xl font-bold text-emerald-600">+{totalAdded}</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Units Removed</p>
          <p className="text-2xl font-bold text-red-500">−{totalRemoved}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          placeholder="Search products…"
          className="input sm:max-w-xs"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'remove', label: 'Sold / Removed' },
            { key: 'add', label: 'Added' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-gray-900 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-400">Loading…</div>
      ) : months.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium text-gray-600">No transactions yet</p>
          <p className="text-sm text-gray-400 mt-1">Add or remove stock to see history here</p>
        </div>
      ) : (
        <div className="space-y-8">
          {months.map(month => {
            const days = Object.keys(grouped[month]).sort((a, b) => new Date(b) - new Date(a));
            const monthTotal = Object.values(grouped[month]).flat();
            const monthAdded = monthTotal.filter(t => t.type === 'add').reduce((s, t) => s + t.quantity, 0);
            const monthRemoved = monthTotal.filter(t => t.type === 'remove').reduce((s, t) => s + t.quantity, 0);

            return (
              <div key={month}>
                {/* Month header */}
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex-1">
                    <h2 className="text-lg font-bold text-gray-900">{month}</h2>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    {monthAdded > 0 && (
                      <span className="badge badge-green">+{monthAdded} added</span>
                    )}
                    {monthRemoved > 0 && (
                      <span className="badge badge-red">−{monthRemoved} removed</span>
                    )}
                  </div>
                </div>

                {/* Days within month */}
                <div className="space-y-4">
                  {days.map(day => {
                    const txns = grouped[month][day].sort(
                      (a, b) => new Date(b.created_at) - new Date(a.created_at)
                    );
                    const firstDate = txns[0].created_at;

                    return (
                      <div key={day} className="card overflow-hidden">
                        {/* Day header */}
                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700">
                            {formatDay(firstDate)}
                          </span>
                          <span className="text-xs text-gray-400">{txns.length} transaction{txns.length !== 1 ? 's' : ''}</span>
                        </div>

                        {/* Transactions */}
                        <div className="divide-y divide-gray-50">
                          {txns.map(t => (
                            <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                              {/* Type indicator */}
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                t.type === 'add' ? 'bg-emerald-100' : 'bg-red-100'
                              }`}>
                                {t.type === 'add' ? (
                                  <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                  </svg>
                                )}
                              </div>

                              {/* Product info */}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{t.name}</p>
                                <p className="text-xs text-gray-400 truncate">{t.path}</p>
                                {t.notes && (
                                  <p className="text-xs text-gray-500 italic mt-0.5">{t.notes}</p>
                                )}
                              </div>

                              {/* Qty + time */}
                              <div className="text-right flex-shrink-0">
                                <p className={`font-bold text-sm ${t.type === 'add' ? 'text-emerald-600' : 'text-red-500'}`}>
                                  {t.type === 'add' ? '+' : '−'}{t.quantity}
                                </p>
                                <p className="text-xs text-gray-400">{formatTime(t.created_at)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
