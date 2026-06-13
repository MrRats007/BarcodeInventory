# Inventory Manager

A full-stack inventory management system with hierarchical categories, Code 128 barcodes, and camera scanning.

## Quick Start

### 1. Install dependencies (one time)

```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### 2. Start the backend

```bash
cd backend
npm start
# Runs on http://localhost:3001
```

### 3. Start the frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:5173
```

Open **http://localhost:5173** in your browser.

---

## Features

- **User accounts** — register and log in; all data is scoped per user
- **Hierarchical categories** — build trees like: `Phones › iPhone › iPhone 11 › MagSafe › Clear`
  - Every node (at any level) gets a unique Code 128 barcode
  - Leaf nodes (no sub-categories) track stock and show the barcode
- **Barcode printing** — click "Barcode" on any leaf item to view and print a label
- **Inventory page** — searchable table of all products with current stock
- **Sold History** — all add/remove transactions, grouped by month then date
- **Scanner page**
  - **Camera mode** — point your phone camera at a Code 128 barcode; it auto-detects and looks up the product
  - **Manual mode** — type the barcode value (e.g. `INVAB12CD34`) to look up a product
  - Confirm quantity, add optional notes, then remove from inventory

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | SQLite (node-sqlite3-wasm — pure WASM, no native build) |
| Auth | JWT (bcryptjs for password hashing) |
| Barcode gen | bwip-js (Code 128 PNG) |
| Frontend | React 18 + Vite + React Router v6 |
| Styling | Tailwind CSS v3 |
| Barcode scan | @zxing/browser (camera-based Code 128 reader) |

## Database location

The SQLite database is stored at `~/.inventory-manager/inventory.db` (your home directory). This persists across restarts.
