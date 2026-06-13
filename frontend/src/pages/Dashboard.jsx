import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';

function StatCard({ label, value, sub }) {
  return (
    <div className="card px-5 py-4">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function formatDate(dt) {
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    api.get('/inventory/stats').then(r => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-7">
        <h1 className="text-xl font-semibold text-gray-900">
          {getGreeting()}, {user.name?.split(' ')[0]}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Here's your inventory at a glance.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-sm text-gray-400">Loading…</div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <StatCard label="Categories" value={stats?.totalProducts} />
            <StatCard label="Product SKUs" value={stats?.totalLeaves} />
            <StatCard label="Total Units" value={stats?.totalStock} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Recent activity */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Recent Activity</p>
                <Link to="/history" className="text-xs text-gray-400 hover:text-gray-600">View all →</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {(!stats?.recentTransactions?.length) && (
                  <p className="px-5 py-8 text-center text-sm text-gray-400">No transactions yet</p>
                )}
                {stats?.recentTransactions?.map(t => (
                  <div key={t.id} className="px-5 py-3 flex items-center gap-3">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5 ${
                      t.type === 'add' ? 'bg-emerald-400' : 'bg-red-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{t.name}</p>
                      <p className="text-xs text-gray-400">{formatDate(t.created_at)}</p>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${
                      t.type === 'add' ? 'text-emerald-600' : 'text-red-500'
                    }`}>
                      {t.type === 'add' ? '+' : '−'}{t.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Low stock */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Low Stock</p>
                <Link to="/inventory" className="text-xs text-gray-400 hover:text-gray-600">View all →</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {(!stats?.lowStock?.length) && (
                  <p className="px-5 py-8 text-center text-sm text-gray-400">All products sufficiently stocked</p>
                )}
                {stats?.lowStock?.map(item => (
                  <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 truncate">{item.name}</p>
                      <p className="text-xs text-gray-400 truncate">{item.path}</p>
                    </div>
                    <span className={`badge ${item.quantity === 0 ? 'badge-red' : 'badge-yellow'}`}>
                      {item.quantity} left
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { to: '/branches',  label: 'Products',     icon: '📦' },
              { to: '/inventory', label: 'Inventory',    icon: '📊' },
              { to: '/scanner',   label: 'Scan',         icon: '📷' },
              { to: '/history',   label: 'History',      icon: '📋' },
            ].map(({ to, label, icon }) => (
              <Link key={to} to={to}
                className="card px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <span className="text-lg">{icon}</span>
                <span className="text-sm text-gray-600 font-medium">{label}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
