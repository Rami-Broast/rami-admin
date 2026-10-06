import React, { useCallback, useMemo, useRef, useState } from 'react';

import { ApiError } from '../api/http';
import { ImageField } from '../components/ImageField';
import { resolveImageUrl } from '../util/imageUrl';
import {
  Addon,
  Availability,
  Category,
  MenuProductDetail,
  ModifierGroup,
  Product,
  TaxClass,
  Variant,
} from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { BranchSelect } from '../components/BranchSelect';
import { Modal } from '../components/Modal';
import { DataState, StatusChip } from '../components/ui';
import { useAsync } from '../hooks/useAsync';
import { formatMinor, formatSar, parseSarToMinor } from '../util/money';

type Tab = 'catalog' | 'availability';

/**
 * Menu management. Two tabs matching the backend's two permission levels:
 *   - Catalog: org-wide categories + products (menu:write, owner)
 *   - Availability: per-branch on/off + price override (menu:availability)
 */
export function MenuPage(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('catalog');
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Menu</h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <TabBtn active={tab === 'catalog'} onClick={() => setTab('catalog')}>Catalog</TabBtn>
          <TabBtn active={tab === 'availability'} onClick={() => setTab('availability')}>
            Per-branch availability
          </TabBtn>
        </div>
      </div>
      {tab === 'catalog' ? <Catalog /> : <AvailabilityPanel />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      className={active ? 'btn' : 'btn btn-ghost'}
      onClick={onClick}
      style={{ padding: '6px 14px', fontSize: 14 }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Catalog: categories + products
// ---------------------------------------------------------------------------

function Catalog(): React.JSX.Element {
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const reload = (): void => setTick((n) => n + 1);
  const categories = useAsync(() => api.listCategories(true), [tick]);
  const products = useAsync(() => api.listProducts({ includeInactive: true }), [tick]);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | 'new' | null>(null);
  const [showBulkAdd, setShowBulkAdd] = useState(false);

  const catList: Category[] = categories.data ?? [];
  const productList: Product[] = useMemo(
    () => (products.data ?? []).filter((p) => !selectedCategory || p.categoryId === selectedCategory),
    [products.data, selectedCategory],
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ flex: 1 }}>Categories</strong>
          <button className="btn btn-ghost" onClick={() => setShowNewCategory(true)} style={{ padding: '4px 10px' }}>
            + New
          </button>
        </div>
        <DataState
          loading={categories.loading}
          error={categories.error?.message ?? null}
          empty={catList.length === 0}
          onRetry={categories.reload}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <button
              className={selectedCategory === '' ? 'btn' : 'btn btn-ghost'}
              onClick={() => setSelectedCategory('')}
              style={{ padding: '6px 10px', textAlign: 'left' }}
            >
              All
            </button>
            {catList.map((c) => (
              <button
                key={c.id}
                className={selectedCategory === c.id ? 'btn' : 'btn btn-ghost'}
                onClick={() => setSelectedCategory(c.id)}
                style={{ padding: '6px 10px', textAlign: 'left' }}
              >
                {c.name} {c.isActive === false ? <em style={{ opacity: 0.6 }}>(hidden)</em> : null}
              </button>
            ))}
          </div>
        </DataState>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <strong style={{ flex: 1 }}>Products</strong>
          <button
            className="btn btn-ghost"
            onClick={() => setShowBulkAdd(true)}
            disabled={catList.length === 0}
          >
            + Bulk add
          </button>
          <button className="btn" onClick={() => setEditProduct('new')} disabled={catList.length === 0}>
            + New product
          </button>
        </div>
        <DataState
          loading={products.loading}
          error={products.error?.message ?? null}
          empty={productList.length === 0}
          onRetry={products.reload}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            {productList.map((p) => (
              <div
                key={p.id}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}
              >
                {p.imageUrl ? (
                  <img
                    src={resolveImageUrl(p.imageUrl) ?? ''}
                    alt=""
                    style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : null}
                <div style={{ flex: 1 }}>
                  <strong>{p.name}</strong>
                  {p.sku ? <span className="muted" style={{ marginLeft: 8 }}>· {p.sku}</span> : null}
                  <div className="muted" style={{ fontSize: 12 }}>
                    {catList.find((c) => c.id === p.categoryId)?.name ?? '—'} · {p.taxClass.toLowerCase().replace(/_/g, ' ')}
                    {p.variants && p.variants.length > 0 ? ` · ${p.variants.length} variant${p.variants.length > 1 ? 's' : ''}` : ''}
                  </div>
                </div>
                <span style={{ fontWeight: 700 }}>{formatSar(p.basePriceMinor)}</span>
                <StatusChip label={p.isActive ? 'active' : 'inactive'} tone={p.isActive ? 'success' : 'neutral'} />
                <button className="btn btn-ghost" onClick={() => setEditProduct(p)} style={{ padding: '6px 12px' }}>
                  Edit
                </button>
              </div>
            ))}
          </div>
        </DataState>
      </div>

      <Modal
        open={showNewCategory}
        onClose={() => setShowNewCategory(false)}
        title="New category"
      >
        <CategoryForm
          onSave={async (input) => {
            await api.createCategory(input);
            reload();
            setShowNewCategory(false);
          }}
        />
      </Modal>

      <Modal
        open={showBulkAdd}
        onClose={() => setShowBulkAdd(false)}
        title="Bulk add products"
        width={860}
      >
        <BulkProductForm
          categories={catList}
          defaultCategoryId={selectedCategory || catList[0]?.id || ''}
          onDone={() => {
            reload();
            setShowBulkAdd(false);
          }}
        />
      </Modal>

      <Modal
        open={editProduct !== null}
        onClose={() => setEditProduct(null)}
        title={editProduct === 'new' ? 'New product' : 'Edit product'}
      >
        {editProduct ? (
          <ProductForm
            product={editProduct === 'new' ? null : editProduct}
            categories={catList}
            defaultCategoryId={selectedCategory || catList[0]?.id || ''}
            onSave={async (input) => {
              if (editProduct === 'new') {
                await api.createProduct(input);
              } else {
                await api.updateProduct(editProduct.id, input);
              }
              reload();
              setEditProduct(null);
            }}
            onDelete={
              editProduct !== 'new'
                ? async () => {
                    await api.deleteProduct(editProduct.id);
                    reload();
                    setEditProduct(null);
                  }
                : undefined
            }
          />
        ) : null}
        {editProduct && editProduct !== 'new' ? (
          <VariantsAndModifiers productId={editProduct.id} />
        ) : null}
      </Modal>
    </div>
  );
}

function CategoryForm({
  onSave,
}: {
  onSave: (input: { name: string; nameAr?: string; description?: string; sortOrder?: number }) => Promise<void>;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        nameAr: nameAr.trim() || undefined,
        description: description.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <FormRow label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </FormRow>
      <FormRow label="Name (Arabic)">
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
      </FormRow>
      <FormRow label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormRow>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <button className="btn" disabled={busy || !name.trim()} style={{ width: '100%', marginTop: 8 }}>
        {busy ? 'Saving…' : 'Create'}
      </button>
    </form>
  );
}

function ProductForm({
  product,
  categories,
  defaultCategoryId,
  onSave,
  onDelete,
}: {
  product: Product | null;
  categories: Category[];
  defaultCategoryId: string;
  onSave: (input: {
    categoryId: string;
    name: string;
    nameAr?: string;
    description?: string;
    sku?: string;
    basePriceMinor: number;
    deliveryUpliftPercent?: number | null;
    taxClass?: TaxClass;
    isActive?: boolean;
    imageUrl?: string;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}): React.JSX.Element {
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? defaultCategoryId);
  const [name, setName] = useState(product?.name ?? '');
  const [nameAr, setNameAr] = useState(product?.nameAr ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [price, setPrice] = useState(formatMinor(product?.basePriceMinor ?? 0));
  // Blank means "use the branch's uplift". A typed 0 means "never uplift this
  // item" and is a different thing — so this is a string, not a number with a
  // default, and only a non-empty value is sent.
  const [uplift, setUplift] = useState(
    product?.deliveryUpliftPercent === null || product?.deliveryUpliftPercent === undefined
      ? ''
      : String(product.deliveryUpliftPercent),
  );
  const [taxClass, setTaxClass] = useState<TaxClass>(product?.taxClass ?? 'STANDARD');
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({
        categoryId,
        name: name.trim(),
        nameAr: nameAr.trim() || undefined,
        description: description.trim() || undefined,
        sku: sku.trim() || undefined,
        basePriceMinor: parseSarToMinor(price),
        deliveryUpliftPercent: uplift.trim() === '' ? null : Number(uplift),
        taxClass,
        isActive,
        imageUrl: imageUrl.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <FormRow label="Category">
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FormRow>
      <FormRow label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </FormRow>
      <FormRow label="Name (Arabic)">
        <input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
      </FormRow>
      <FormRow label="SKU">
        <input value={sku} onChange={(e) => setSku(e.target.value)} />
      </FormRow>
      <FormRow label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormRow>
      <ImageField
        label="Photo"
        value={imageUrl}
        onChange={setImageUrl}
        hint="Shown on the menu card and the product screen. JPEG, PNG or WebP, up to 6 MB."
      />
      <FormRow label="Price (SAR, VAT inclusive)">
        <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" required />
      </FormRow>
      <FormRow label="Delivery uplift (%)">
        <input
          value={uplift}
          onChange={(e) => setUplift(e.target.value)}
          inputMode="decimal"
          placeholder="Use branch default"
        />
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          Overrides the branch&rsquo;s delivery uplift for this item only. Leave blank to use the
          branch setting. Enter <strong>0</strong> to never raise this item&rsquo;s price on
          delivery &mdash; that is a real choice, not the same as blank.
        </p>
      </FormRow>
      <FormRow label="Tax class">
        <select value={taxClass} onChange={(e) => setTaxClass(e.target.value as TaxClass)}>
          <option value="STANDARD">Standard (15%)</option>
          <option value="ZERO_RATED">Zero-rated</option>
          <option value="EXEMPT">Exempt</option>
        </select>
      </FormRow>
      {product ? (
        <FormRow label="Active">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            style={{ width: 'auto' }}
          />
        </FormRow>
      ) : null}
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn" disabled={busy || !name.trim() || !categoryId} style={{ flex: 1 }}>
          {busy ? 'Saving…' : product ? 'Save changes' : 'Create'}
        </button>
        {onDelete ? (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            disabled={busy}
            onClick={async () => {
              if (!confirm('Remove this product? Every branch will stop selling it.')) return;
              setBusy(true);
              try {
                await onDelete();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : 'Failed to delete.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
    </form>
  );
}

interface BulkRow {
  key: number;
  name: string;
  nameAr: string;
  price: string;
  categoryId: string;
  sku: string;
  description: string;
  imageUrl: string;
  taxClass: TaxClass;
  status: 'pending' | 'saving' | 'done' | 'error';
  error?: string;
}

let bulkKeySeq = 0;
function emptyRow(categoryId: string): BulkRow {
  return {
    key: ++bulkKeySeq,
    name: '',
    nameAr: '',
    price: '',
    categoryId,
    sku: '',
    description: '',
    imageUrl: '',
    taxClass: 'STANDARD',
    status: 'pending',
  };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

function BulkProductForm({
  categories,
  defaultCategoryId,
  onDone,
}: {
  categories: Category[];
  defaultCategoryId: string;
  onDone: () => void;
}): React.JSX.Element {
  const { api } = useAuth();
  const [rows, setRows] = useState<BulkRow[]>(() =>
    Array.from({ length: 5 }, () => emptyRow(defaultCategoryId)),
  );
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ ok: number; fail: number } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const catByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.name.toLowerCase(), c.id);
      if (c.nameAr) map.set(c.nameAr.toLowerCase(), c.id);
    }
    return map;
  }, [categories]);

  const handleCSV = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== 'string') return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) { setCsvError('CSV must have a header row and at least one data row.'); return; }

      const header = parseCSVLine(lines[0]!).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
      const nameIdx = header.findIndex((h) => h === 'name' || h === 'productname' || h === 'product');
      const priceIdx = header.findIndex((h) => h === 'price' || h === 'pricesar' || h === 'baseprice');
      if (nameIdx < 0 || priceIdx < 0) { setCsvError('CSV must have "name" and "price" columns.'); return; }

      const nameArIdx = header.findIndex((h) => h === 'namear' || h === 'arabicname' || h === 'namearabic');
      const catIdx = header.findIndex((h) => h === 'category' || h === 'categoryname');
      const skuIdx = header.findIndex((h) => h === 'sku');
      const descIdx = header.findIndex((h) => h === 'description' || h === 'desc');
      const taxIdx = header.findIndex((h) => h === 'tax' || h === 'taxclass');
      const imgIdx = header.findIndex((h) => h === 'imageurl' || h === 'image' || h === 'img');

      const imported: BulkRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]!);
        const name = cols[nameIdx]?.trim() ?? '';
        const price = cols[priceIdx]?.trim() ?? '';
        if (!name || !price) continue;

        const catName = catIdx >= 0 ? (cols[catIdx]?.trim() ?? '') : '';
        const resolvedCat = catName ? (catByName.get(catName.toLowerCase()) ?? defaultCategoryId) : defaultCategoryId;

        let tax: TaxClass = 'STANDARD';
        if (taxIdx >= 0) {
          const raw = (cols[taxIdx]?.trim() ?? '').toUpperCase();
          if (raw === 'ZERO_RATED' || raw === 'ZERO' || raw === '0') tax = 'ZERO_RATED';
          else if (raw === 'EXEMPT') tax = 'EXEMPT';
        }

        imported.push({
          key: ++bulkKeySeq,
          name,
          nameAr: nameArIdx >= 0 ? (cols[nameArIdx]?.trim() ?? '') : '',
          price,
          categoryId: resolvedCat,
          sku: skuIdx >= 0 ? (cols[skuIdx]?.trim() ?? '') : '',
          description: descIdx >= 0 ? (cols[descIdx]?.trim() ?? '') : '',
          imageUrl: imgIdx >= 0 ? (cols[imgIdx]?.trim() ?? '') : '',
          taxClass: tax,
          status: 'pending',
        });
      }

      if (imported.length === 0) { setCsvError('No valid rows found. Each row needs at least name and price.'); return; }
      setRows((prev) => {
        const pending = prev.filter((r) => r.status === 'pending' && !r.name.trim());
        return [...prev.filter((r) => r.name.trim() || r.status !== 'pending'), ...imported, ...pending.slice(0, Math.max(0, 2 - imported.length))];
      });
      setSummary(null);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  }, [catByName, defaultCategoryId]);

  const updateRow = (key: number, patch: Partial<BulkRow>): void => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRows = (): void => {
    setRows((prev) => [...prev, ...Array.from({ length: 5 }, () => emptyRow(defaultCategoryId))]);
  };

  const removeRow = (key: number): void => {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length === 0 ? [emptyRow(defaultCategoryId)] : next;
    });
  };

  const validRows = rows.filter((r) => r.name.trim() && r.price.trim());

  const submit = async (): Promise<void> => {
    if (validRows.length === 0) return;
    setBusy(true);
    setSummary(null);

    let ok = 0;
    let fail = 0;

    for (const row of rows) {
      if (!row.name.trim() || !row.price.trim()) continue;
      updateRow(row.key, { status: 'saving', error: undefined });
      try {
        await api.createProduct({
          categoryId: row.categoryId,
          name: row.name.trim(),
          nameAr: row.nameAr.trim() || undefined,
          description: row.description.trim() || undefined,
          sku: row.sku.trim() || undefined,
          basePriceMinor: parseSarToMinor(row.price),
          taxClass: row.taxClass,
          imageUrl: row.imageUrl.trim() || undefined,
        });
        updateRow(row.key, { status: 'done' });
        ok++;
      } catch (err) {
        updateRow(row.key, {
          status: 'error',
          error: err instanceof ApiError ? err.message : 'Failed',
        });
        fail++;
      }
    }

    setSummary({ ok, fail });
    setBusy(false);
  };

  const allDone = summary !== null && summary.fail === 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <p className="muted" style={{ fontSize: 13, margin: 0, flex: 1 }}>
          Fill in rows manually or import a CSV file. Columns: name, price, category, nameAr, sku, description, imageUrl, tax.
        </p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleCSV} hidden />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}
        >
          Import CSV
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            const header = 'name,price,category,nameAr,sku,description,imageUrl,tax';
            const sample = 'Chicken Shawarma,15.00,Main Dishes,شاورما دجاج,SKU001,Grilled chicken wrap,https://example.com/img.jpg,STANDARD';
            const blob = new Blob([header + '\n' + sample + '\n'], { type: 'text/csv' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'menu-template.csv';
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          style={{ padding: '6px 14px', whiteSpace: 'nowrap' }}
        >
          Download template
        </button>
      </div>
      {csvError ? <p style={{ color: 'var(--danger)', fontSize: 13, margin: '0 0 8px' }}>{csvError}</p> : null}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={bulkHead}>Name *</th>
              <th style={bulkHead}>Arabic name</th>
              <th style={{ ...bulkHead, width: 100 }}>Price (SAR) *</th>
              <th style={bulkHead}>Category</th>
              <th style={bulkHead}>SKU</th>
              <th style={{ ...bulkHead, width: 110 }}>Tax</th>
              <th style={{ ...bulkHead, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={row.status === 'done' ? { opacity: 0.5 } : undefined}>
                <td style={bulkCell}>
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(row.key, { name: e.target.value })}
                    disabled={row.status === 'done' || row.status === 'saving'}
                    placeholder="Product name"
                    style={{ width: '100%' }}
                  />
                </td>
                <td style={bulkCell}>
                  <input
                    value={row.nameAr}
                    onChange={(e) => updateRow(row.key, { nameAr: e.target.value })}
                    disabled={row.status === 'done' || row.status === 'saving'}
                    dir="rtl"
                    placeholder="Arabic"
                    style={{ width: '100%' }}
                  />
                </td>
                <td style={bulkCell}>
                  <input
                    value={row.price}
                    onChange={(e) => updateRow(row.key, { price: e.target.value })}
                    disabled={row.status === 'done' || row.status === 'saving'}
                    inputMode="decimal"
                    placeholder="0.00"
                    style={{ width: '100%' }}
                  />
                </td>
                <td style={bulkCell}>
                  <select
                    value={row.categoryId}
                    onChange={(e) => updateRow(row.key, { categoryId: e.target.value })}
                    disabled={row.status === 'done' || row.status === 'saving'}
                    style={{ width: '100%' }}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </td>
                <td style={bulkCell}>
                  <input
                    value={row.sku}
                    onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                    disabled={row.status === 'done' || row.status === 'saving'}
                    placeholder="Optional"
                    style={{ width: '100%' }}
                  />
                </td>
                <td style={bulkCell}>
                  <select
                    value={row.taxClass}
                    onChange={(e) => updateRow(row.key, { taxClass: e.target.value as TaxClass })}
                    disabled={row.status === 'done' || row.status === 'saving'}
                    style={{ width: '100%' }}
                  >
                    <option value="STANDARD">15%</option>
                    <option value="ZERO_RATED">0%</option>
                    <option value="EXEMPT">Exempt</option>
                  </select>
                </td>
                <td style={bulkCell}>
                  {row.status === 'done' ? (
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>Done</span>
                  ) : row.status === 'saving' ? (
                    <span className="muted">Saving</span>
                  ) : row.status === 'error' ? (
                    <span title={row.error} style={{ color: 'var(--danger)', cursor: 'help' }}>Failed</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', color: 'var(--danger)' }}
                      onClick={() => removeRow(row.key)}
                      title="Remove row"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={addRows}
          disabled={busy}
          style={{ padding: '6px 14px' }}
        >
          + 5 more rows
        </button>
        <span style={{ flex: 1 }} />
        {summary ? (
          <span style={{ fontSize: 13 }}>
            <strong style={{ color: 'var(--success)' }}>{summary.ok} saved</strong>
            {summary.fail > 0 ? (
              <span style={{ color: 'var(--danger)', marginLeft: 8 }}>{summary.fail} failed</span>
            ) : null}
          </span>
        ) : null}
        {allDone ? (
          <button className="btn" onClick={onDone} style={{ padding: '8px 20px' }}>
            Done
          </button>
        ) : (
          <button
            className="btn"
            onClick={submit}
            disabled={busy || validRows.length === 0}
            style={{ padding: '8px 20px' }}
          >
            {busy ? 'Saving…' : `Save ${validRows.length} product${validRows.length !== 1 ? 's' : ''}`}
          </button>
        )}
      </div>
    </div>
  );
}

const bulkHead: React.CSSProperties = { padding: '6px 4px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12 };
const bulkCell: React.CSSProperties = { padding: '3px 4px' };

/** Runs an async mutation, surfacing any ApiError message through alert(). */
async function runMutation(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    alert(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    return false;
  }
}

/**
 * Editable view of a product's variants and modifier groups, backed by the
 * menu:write CRUD surface. A variant's price is absolute (it replaces the base
 * price); modifier groups are reusable and shared across products, so they are
 * managed centrally and attached/detached per product.
 */
function VariantsAndModifiers({ productId }: { productId: string }): React.JSX.Element {
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const reload = (): void => setTick((n) => n + 1);
  const detail = useAsync<MenuProductDetail>(() => api.getMenuProduct(productId), [productId, tick]);
  const allGroups = useAsync<ModifierGroup[]>(() => api.listModifierGroups(true), [tick]);

  const variants = detail.data?.variants ?? [];
  const links = detail.data?.modifierGroups ?? [];
  const attachedIds = new Set(links.map((l) => l.modifierGroupId));
  const unattached = (allGroups.data ?? []).filter((g) => !attachedIds.has(g.id));

  const [manage, setManage] = useState(false);

  return (
    <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <DataState loading={detail.loading} error={detail.error?.message ?? null} onRetry={detail.reload}>
        <h4 style={{ margin: '0 0 4px' }}>Variants ({variants.length})</h4>
        <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
          A variant’s price is absolute — it replaces the base price. One variant can be the default.
        </p>
        <div style={{ display: 'grid', gap: 6 }}>
          {variants.map((v) => (
            <VariantRow key={v.id} variant={v} onChanged={reload} />
          ))}
          <AddVariantRow productId={productId} onAdded={reload} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 8px' }}>
          <h4 style={{ margin: 0, flex: 1 }}>Modifier groups ({links.length})</h4>
          <button className="btn btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setManage((m) => !m)}>
            {manage ? 'Done managing' : 'Manage groups'}
          </button>
        </div>

        {links.length === 0 ? (
          <p className="muted" style={{ marginTop: 0 }}>No modifier groups attached.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {links.map((link) => (
              <div key={link.modifierGroupId} className="card" style={{ padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{link.modifierGroup.name}</strong>
                  {link.modifierGroup.isRequired ? <StatusChip label="required" tone="warning" /> : null}
                  <span className="muted" style={{ fontSize: 12 }}>
                    choose {link.modifierGroup.minSelections}–{link.modifierGroup.maxSelections}
                  </span>
                  <button
                    className="btn btn-ghost"
                    style={{ marginLeft: 'auto', padding: '4px 10px' }}
                    onClick={async () => {
                      if (await runMutation(() => api.detachModifierGroup(productId, link.modifierGroupId))) reload();
                    }}
                  >
                    Detach
                  </button>
                </div>
                {link.modifierGroup.addons.length > 0 ? (
                  <ul className="muted" style={{ margin: '6px 0 0 18px', fontSize: 13 }}>
                    {link.modifierGroup.addons.map((a) => (
                      <li key={a.id}>
                        {a.name}
                        {a.priceMinor > 0 ? ` (+${formatSar(a.priceMinor)})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <AttachGroupRow
          groups={unattached}
          onAttach={async (id) => {
            if (await runMutation(() => api.attachModifierGroup(productId, { modifierGroupId: id }))) reload();
          }}
        />

        {manage ? (
          <div style={{ marginTop: 16, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
            <strong style={{ display: 'block', marginBottom: 8 }}>All modifier groups</strong>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Groups are shared — editing one changes it everywhere it’s attached.
            </p>
            <ModifierGroupManager onChanged={reload} />
          </div>
        ) : null}
      </DataState>
    </div>
  );
}

function VariantRow({ variant, onChanged }: { variant: Variant; onChanged: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [name, setName] = useState(variant.name);
  const [price, setPrice] = useState(formatMinor(variant.priceMinor));
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== variant.name || parseSarToMinor(price || '0') !== variant.priceMinor;

  const call = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    if (await runMutation(fn)) onChanged();
    setBusy(false);
  };

  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 90 }} />
      <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" style={{ width: 84 }} />
      {variant.isDefault ? (
        <StatusChip label="default" tone="progress" />
      ) : (
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12 }}
          disabled={busy}
          onClick={() => call(() => api.updateVariant(variant.id, { isDefault: true }))}
        >
          Make default
        </button>
      )}
      <button
        className="btn btn-ghost"
        style={{ padding: '4px 8px', fontSize: 12 }}
        disabled={busy}
        onClick={() => call(() => api.updateVariant(variant.id, { isActive: !variant.isActive }))}
      >
        {variant.isActive ? 'active' : 'inactive'}
      </button>
      {dirty ? (
        <button
          className="btn"
          style={{ padding: '4px 10px' }}
          disabled={busy}
          onClick={() =>
            call(() => api.updateVariant(variant.id, { name: name.trim(), priceMinor: parseSarToMinor(price) }))
          }
        >
          Save
        </button>
      ) : null}
      <button
        className="btn btn-ghost"
        style={{ padding: '4px 8px', color: 'var(--danger)' }}
        disabled={busy}
        title="Remove variant"
        onClick={() => {
          if (confirm('Remove this variant?')) void call(() => api.deleteVariant(variant.id));
        }}
      >
        ✕
      </button>
    </div>
  );
}

function AddVariantRow({ productId, onAdded }: { productId: string; onAdded: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (): Promise<void> => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await runMutation(() =>
      api.createVariant(productId, { name: name.trim(), priceMinor: parseSarToMinor(price || '0') }),
    );
    if (ok) {
      setName('');
      setPrice('');
      onAdded();
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input placeholder="New variant name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      <input placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" style={{ width: 84 }} />
      <button className="btn" disabled={busy || !name.trim()} onClick={add} style={{ padding: '6px 12px' }}>
        Add
      </button>
    </div>
  );
}

function AttachGroupRow({
  groups,
  onAttach,
}: {
  groups: ModifierGroup[];
  onAttach: (id: string) => Promise<void>;
}): React.JSX.Element {
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);

  if (groups.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        No more groups to attach — create one under “Manage groups”.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
      <select value={sel} onChange={(e) => setSel(e.target.value)} style={{ flex: 1 }}>
        <option value="">Attach an existing group…</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        className="btn"
        disabled={!sel || busy}
        style={{ padding: '6px 12px' }}
        onClick={async () => {
          setBusy(true);
          await onAttach(sel);
          setSel('');
          setBusy(false);
        }}
      >
        Attach
      </button>
    </div>
  );
}

function ModifierGroupManager({ onChanged }: { onChanged: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [tick, setTick] = useState(0);
  const reload = (): void => {
    setTick((n) => n + 1);
    onChanged();
  };
  const groups = useAsync<ModifierGroup[]>(() => api.listModifierGroups(true), [tick]);
  const [showNew, setShowNew] = useState(false);
  const list = groups.data ?? [];

  return (
    <div>
      <DataState loading={groups.loading} error={groups.error?.message ?? null} onRetry={groups.reload}>
        <div style={{ display: 'grid', gap: 12 }}>
          {list.map((g) => (
            <GroupEditor key={g.id} group={g} onChanged={reload} />
          ))}
        </div>
      </DataState>
      {showNew ? (
        <GroupCreate onDone={() => { setShowNew(false); reload(); }} onCancel={() => setShowNew(false)} />
      ) : (
        <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => setShowNew(true)}>
          + New group
        </button>
      )}
    </div>
  );
}

function GroupEditor({ group, onChanged }: { group: ModifierGroup; onChanged: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [name, setName] = useState(group.name);
  const [min, setMin] = useState(String(group.minSelections));
  const [max, setMax] = useState(String(group.maxSelections));
  const [required, setRequired] = useState(group.isRequired);
  const [busy, setBusy] = useState(false);
  const dirty =
    name.trim() !== group.name ||
    Number(min) !== group.minSelections ||
    Number(max) !== group.maxSelections ||
    required !== group.isRequired;

  const call = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    if (await runMutation(fn)) onChanged();
    setBusy(false);
  };

  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
        <label className="muted" style={{ fontSize: 12 }}>
          min
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" style={{ width: 44, marginLeft: 4 }} />
        </label>
        <label className="muted" style={{ fontSize: 12 }}>
          max
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" style={{ width: 44, marginLeft: 4 }} />
        </label>
        <label className="muted" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 'auto' }} />
          required
        </label>
        {dirty ? (
          <button
            className="btn"
            style={{ padding: '4px 10px' }}
            disabled={busy}
            onClick={() =>
              call(() =>
                api.updateModifierGroup(group.id, {
                  name: name.trim(),
                  minSelections: Number(min),
                  maxSelections: Number(max),
                  isRequired: required,
                }),
              )
            }
          >
            Save
          </button>
        ) : null}
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', color: 'var(--danger)' }}
          disabled={busy}
          onClick={() => {
            if (confirm('Delete this group? It will be removed from every product it’s attached to.')) {
              void call(() => api.deleteModifierGroup(group.id));
            }
          }}
        >
          Delete
        </button>
      </div>
      <div style={{ marginTop: 8, paddingLeft: 8 }}>
        {group.addons.map((a) => (
          <AddonRow key={a.id} addon={a} onChanged={onChanged} />
        ))}
        <AddAddonRow groupId={group.id} onAdded={onChanged} />
      </div>
    </div>
  );
}

function AddonRow({ addon, onChanged }: { addon: Addon; onChanged: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [name, setName] = useState(addon.name);
  const [price, setPrice] = useState(formatMinor(addon.priceMinor));
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== addon.name || parseSarToMinor(price || '0') !== addon.priceMinor;

  const call = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    if (await runMutation(fn)) onChanged();
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <input value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" style={{ width: 76 }} />
      {dirty ? (
        <button
          className="btn"
          style={{ padding: '2px 8px' }}
          disabled={busy}
          onClick={() => call(() => api.updateAddon(addon.id, { name: name.trim(), priceMinor: parseSarToMinor(price) }))}
        >
          Save
        </button>
      ) : null}
      <button
        className="btn btn-ghost"
        style={{ padding: '2px 6px', color: 'var(--danger)' }}
        disabled={busy}
        title="Remove add-on"
        onClick={() => {
          if (confirm('Remove this add-on?')) void call(() => api.deleteAddon(addon.id));
        }}
      >
        ✕
      </button>
    </div>
  );
}

function AddAddonRow({ groupId, onAdded }: { groupId: string; onAdded: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (): Promise<void> => {
    if (!name.trim()) return;
    setBusy(true);
    const ok = await runMutation(() =>
      api.createAddon(groupId, { name: name.trim(), priceMinor: parseSarToMinor(price || '0') }),
    );
    if (ok) {
      setName('');
      setPrice('');
      onAdded();
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
      <input placeholder="New add-on" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
      <input placeholder="+SAR" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" style={{ width: 76 }} />
      <button className="btn btn-ghost" disabled={busy || !name.trim()} onClick={add} style={{ padding: '4px 10px' }}>
        Add
      </button>
    </div>
  );
}

function GroupCreate({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }): React.JSX.Element {
  const { api } = useAuth();
  const [name, setName] = useState('');
  const [min, setMin] = useState('0');
  const [max, setMax] = useState('1');
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createModifierGroup({
        name: name.trim(),
        minSelections: Number(min),
        maxSelections: Number(max),
        isRequired: required,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create group.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={create} className="card" style={{ padding: 10, marginTop: 12 }}>
      <FormRow label="Group name">
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </FormRow>
      <div style={{ display: 'flex', gap: 8 }}>
        <FormRow label="Min selections">
          <input value={min} onChange={(e) => setMin(e.target.value)} inputMode="numeric" />
        </FormRow>
        <FormRow label="Max selections">
          <input value={max} onChange={(e) => setMax(e.target.value)} inputMode="numeric" />
        </FormRow>
      </div>
      <FormRow label="Required">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} style={{ width: 'auto' }} />
      </FormRow>
      {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn" disabled={busy || !name.trim()} style={{ flex: 1 }}>
          {busy ? 'Creating…' : 'Create group'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span className="muted" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Per-branch availability
// ---------------------------------------------------------------------------

function AvailabilityPanel(): React.JSX.Element {
  const { api } = useAuth();
  const [branchId, setBranchId] = useState('');
  const [tick, setTick] = useState(0);
  const availability = useAsync(
    () => (branchId ? api.listAvailability(branchId) : Promise.resolve([] as Availability[])),
    [branchId, tick],
  );
  const [saving, setSaving] = useState<string | null>(null);

  const rows = availability.data ?? [];

  const toggle = async (a: Availability, isAvailable: boolean): Promise<void> => {
    setSaving(a.productId);
    try {
      await api.setAvailability(branchId, a.productId, { isAvailable });
      setTick((n) => n + 1);
    } finally {
      setSaving(null);
    }
  };

  const setOverride = async (a: Availability, priceOverrideMinor: number | null): Promise<void> => {
    setSaving(a.productId);
    try {
      await api.setAvailability(branchId, a.productId, {
        isAvailable: a.isAvailable,
        priceOverrideMinor,
      });
      setTick((n) => n + 1);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span className="muted">Branch</span>
        <BranchSelect value={branchId} onChange={setBranchId} />
      </div>
      <DataState
        loading={availability.loading && rows.length === 0}
        error={availability.error?.message ?? null}
        empty={rows.length === 0}
        onRetry={availability.reload}
      >
        <div className="card" style={{ padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={cellHead}>Product</th>
                <th style={cellHead}>SKU</th>
                <th style={cellHead}>Base price</th>
                <th style={cellHead}>Branch override</th>
                <th style={cellHead}>Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td style={cell}>{a.product.name}</td>
                  <td style={cell}>{a.product.sku ?? '—'}</td>
                  <td style={cell}>{formatSar(a.product.basePriceMinor)}</td>
                  <td style={cell}>
                    <OverrideInput
                      value={a.priceOverrideMinor}
                      disabled={saving === a.productId}
                      onCommit={(v) => setOverride(a, v)}
                    />
                  </td>
                  <td style={cell}>
                    <input
                      type="checkbox"
                      checked={a.isAvailable}
                      disabled={saving === a.productId}
                      onChange={(e) => toggle(a, e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </div>
  );
}

function OverrideInput({
  value,
  disabled,
  onCommit,
}: {
  value: number | null;
  disabled: boolean;
  onCommit: (v: number | null) => void;
}): React.JSX.Element {
  const [text, setText] = useState(value == null ? '' : formatMinor(value));
  return (
    <input
      value={text}
      disabled={disabled}
      inputMode="decimal"
      placeholder="—"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        const next = trimmed === '' ? null : parseSarToMinor(trimmed);
        if (next !== value) onCommit(next);
      }}
      style={{ width: 120 }}
    />
  );
}

const cellHead: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600 };
const cell: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)' };
