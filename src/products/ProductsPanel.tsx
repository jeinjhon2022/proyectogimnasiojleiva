import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  ShoppingCart,
  Undo2,
} from 'lucide-react';
import {
  ApiError,
  activateProduct,
  adjustProductStock,
  createProduct,
  deactivateProduct,
  getProductsSummary,
  listProductSales,
  listProducts,
  sellProduct,
  updateProduct,
  type CashMovementMethod,
  type Product,
  type ProductSale,
  type ProductSalesSummary,
  type TokenGetter,
} from '../api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog } from '../components/ui/dialog';
import { Input, Label, Select } from '../components/ui/input';
import { Badge } from '../components/ui/badge';

const METHOD_LABELS: Record<CashMovementMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card_in_person: 'Tarjeta (presencial)',
  other: 'Otro',
};

interface ProductsPanelProps {
  getToken: TokenGetter;
}

type Tab = 'catalog' | 'sales';

// Productos y stock (PLAN.md — módulo de POS): catálogo con venta de una unidad de
// producto a la vez (sin carrito multi-ítem — simplificación deliberada para este
// primer corte) y descuento automático de inventario.
export default function ProductsPanel({ getToken }: ProductsPanelProps) {
  const [tab, setTab] = useState<Tab>('catalog');
  const [summary, setSummary] = useState<ProductSalesSummary | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    getProductsSummary(getToken)
      .then(setSummary)
      .catch(() => setSummary(null));
  }, [getToken, reloadToken]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Productos</CardTitle>
          <CardDescription>Catálogo, stock y ventas</CardDescription>
        </div>
        <div className="flex gap-1.5">
          <Button
            variant={tab === 'catalog' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={tab === 'catalog'}
            onClick={() => setTab('catalog')}
          >
            <Package className="h-4 w-4" /> Productos
          </Button>
          <Button
            variant={tab === 'sales' ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={tab === 'sales'}
            onClick={() => setTab('sales')}
          >
            Ventas
          </Button>
        </div>
      </CardHeader>

      <div className="grid grid-cols-3 divide-x divide-line border-b border-line">
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-semibold tabular-nums text-chalk">
            USD {(summary?.totalToday ?? 0).toFixed(2)}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
            Ventas hoy
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-semibold tabular-nums text-chalk">
            {summary?.quantityToday ?? '—'}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
            Unidades hoy
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="font-mono text-xl font-semibold tabular-nums text-chalk">
            {summary?.activeProductCount ?? '—'}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
            Productos activos
          </p>
        </div>
      </div>

      <CardContent>
        {tab === 'catalog' ? (
          <Catalog getToken={getToken} onChanged={reload} />
        ) : (
          <SalesHistory getToken={getToken} />
        )}
      </CardContent>
    </Card>
  );
}

function Catalog({ getToken, onChanged }: { getToken: TokenGetter; onChanged: () => void }) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'success'; items: Product[] }
  >({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const reload = () => {
    setReloadToken((value) => value + 1);
    onChanged();
  };

  useEffect(() => {
    let cancelled = false;
    listProducts(getToken, { status: 'all', pageSize: 100 })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', items: data.items });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar el catálogo',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken, reloadToken]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4" /> Nuevo producto
        </Button>
      </div>

      {state.kind === 'loading' && (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-chalk-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando catálogo…
        </p>
      )}
      {state.kind === 'error' && (
        <p role="alert" className="py-6 text-sm text-danger">
          {state.message}
        </p>
      )}
      {state.kind === 'success' && state.items.length === 0 && (
        <p className="py-6 text-center text-sm text-chalk-muted">Todavía no hay productos.</p>
      )}
      {state.kind === 'success' && state.items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.items.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              getToken={getToken}
              onChanged={reload}
            />
          ))}
        </div>
      )}

      <Dialog
        open={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
        title="Nuevo producto"
      >
        <CreateProductForm
          getToken={getToken}
          onCreated={() => {
            setShowCreateDialog(false);
            reload();
          }}
        />
      </Dialog>
    </div>
  );
}

function ProductCard({
  product,
  getToken,
  onChanged,
}: {
  product: Product;
  getToken: TokenGetter;
  onChanged: () => void;
}) {
  const [showSell, setShowSell] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lowStock = product.stock <= product.minStockAlert;

  async function handleToggleActive() {
    setBusy(true);
    setError(null);
    try {
      if (product.isActive) await deactivateProduct(getToken, product.id);
      else await activateProduct(getToken, product.id);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo actualizar el producto');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-chalk">{product.name}</p>
          {product.description && (
            <p className="truncate text-xs text-chalk-muted">{product.description}</p>
          )}
        </div>
        {!product.isActive && <Badge tone="default">Inactivo</Badge>}
      </div>

      <div className="flex items-center justify-between">
        <span className="font-mono text-lg font-semibold text-chalk">
          USD {product.price.toFixed(2)}
        </span>
        <Badge tone={lowStock ? 'warning' : 'success'}>
          {lowStock && <AlertTriangle className="h-3 w-3" />}
          {product.stock} en stock
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {product.isActive ? (
          <>
            <Button
              size="sm"
              disabled={product.stock === 0}
              onClick={() => setShowSell(true)}
              title={product.stock === 0 ? 'Sin stock disponible' : undefined}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Vender
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowStock(true)}>
              <PackagePlus className="h-3.5 w-3.5" /> Stock
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void handleToggleActive()}
            >
              Desactivar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void handleToggleActive()}
          >
            <Undo2 className="h-3.5 w-3.5" /> Reactivar
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <Dialog open={showSell} onClose={() => setShowSell(false)} title={`Vender — ${product.name}`}>
        <SellForm
          getToken={getToken}
          product={product}
          onSold={() => {
            setShowSell(false);
            onChanged();
          }}
        />
      </Dialog>
      <Dialog
        open={showStock}
        onClose={() => setShowStock(false)}
        title={`Ajustar stock — ${product.name}`}
      >
        <AdjustStockForm
          getToken={getToken}
          product={product}
          onAdjusted={() => {
            setShowStock(false);
            onChanged();
          }}
        />
      </Dialog>
      <Dialog open={showEdit} onClose={() => setShowEdit(false)} title={`Editar — ${product.name}`}>
        <EditProductForm
          getToken={getToken}
          product={product}
          onSaved={() => {
            setShowEdit(false);
            onChanged();
          }}
        />
      </Dialog>
    </div>
  );
}

function CreateProductForm({
  getToken,
  onCreated,
}: {
  getToken: TokenGetter;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [minStockAlert, setMinStockAlert] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createProduct(getToken, {
        name,
        description: description || undefined,
        price: Number(price),
        stock: Number(stock),
        minStockAlert: Number(minStockAlert),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo crear el producto');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="product-name">Nombre</Label>
        <Input
          id="product-name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="product-description">Descripción (opcional)</Label>
        <Input
          id="product-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1"
        />
      </div>
      <div className="flex gap-2">
        <div>
          <Label htmlFor="product-price">Precio (USD)</Label>
          <Input
            id="product-price"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            required
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 w-28"
          />
        </div>
        <div>
          <Label htmlFor="product-stock">Stock inicial</Label>
          <Input
            id="product-stock"
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(event) => setStock(event.target.value)}
            className="mt-1 w-24"
          />
        </div>
        <div>
          <Label htmlFor="product-min-stock">Alerta stock mínimo</Label>
          <Input
            id="product-min-stock"
            type="number"
            min="0"
            step="1"
            value={minStockAlert}
            onChange={(event) => setMinStockAlert(event.target.value)}
            className="mt-1 w-24"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar producto
        </Button>
      </div>
    </form>
  );
}

function EditProductForm({
  getToken,
  product,
  onSaved,
}: {
  getToken: TokenGetter;
  product: Product;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [price, setPrice] = useState(String(product.price));
  const [minStockAlert, setMinStockAlert] = useState(String(product.minStockAlert));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await updateProduct(getToken, product.id, {
        name,
        description: description || null,
        price: Number(price),
        minStockAlert: Number(minStockAlert),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar el cambio');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="edit-product-name">Nombre</Label>
        <Input
          id="edit-product-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="edit-product-description">Descripción</Label>
        <Input
          id="edit-product-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="mt-1"
        />
      </div>
      <div className="flex gap-2">
        <div>
          <Label htmlFor="edit-product-price">Precio (USD)</Label>
          <Input
            id="edit-product-price"
            type="number"
            min="0"
            max="100000"
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="mt-1 w-28"
          />
        </div>
        <div>
          <Label htmlFor="edit-product-min-stock">Alerta stock mínimo</Label>
          <Input
            id="edit-product-min-stock"
            type="number"
            min="0"
            step="1"
            value={minStockAlert}
            onChange={(event) => setMinStockAlert(event.target.value)}
            className="mt-1 w-24"
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </Button>
      </div>
    </form>
  );
}

function AdjustStockForm({
  getToken,
  product,
  onAdjusted,
}: {
  getToken: TokenGetter;
  product: Product;
  onAdjusted: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedDelta = Number(delta);
    if (!Number.isInteger(parsedDelta) || parsedDelta === 0) {
      setError('Ingresa un ajuste distinto de cero (positivo para reponer, negativo para restar)');
      return;
    }
    if (!reason.trim()) {
      setError('Describe el motivo del ajuste');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adjustProductStock(getToken, product.id, { delta: parsedDelta, reason: reason.trim() });
      onAdjusted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ajustar el stock');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <p className="text-sm text-chalk-muted">
        Stock actual: <strong className="text-chalk">{product.stock}</strong>
      </p>
      <div>
        <Label htmlFor="stock-delta">Ajuste (+ repone, - resta)</Label>
        <Input
          id="stock-delta"
          type="number"
          step="1"
          required
          value={delta}
          onChange={(event) => setDelta(event.target.value)}
          placeholder="Ej. 20 o -3"
          className="mt-1 w-28"
        />
      </div>
      <div>
        <Label htmlFor="stock-reason">Motivo</Label>
        <Input
          id="stock-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej. reposición de proveedor"
          className="mt-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Registrar ajuste
        </Button>
      </div>
    </form>
  );
}

function SellForm({
  getToken,
  product,
  onSold,
}: {
  getToken: TokenGetter;
  product: Product;
  onSold: () => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const [method, setMethod] = useState<CashMovementMethod>('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedQuantity = Number(quantity);
  const total = Number.isFinite(parsedQuantity) ? parsedQuantity * product.price : 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError('Ingresa una cantidad válida (mayor a 0)');
      return;
    }
    if (parsedQuantity > product.stock) {
      setError(`Solo quedan ${product.stock} unidades disponibles`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sellProduct(getToken, product.id, { quantity: parsedQuantity, method });
      onSold();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo registrar la venta');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div>
          <Label htmlFor="sell-quantity">Cantidad</Label>
          <Input
            id="sell-quantity"
            type="number"
            min="1"
            max={product.stock}
            step="1"
            required
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="mt-1 w-24"
          />
        </div>
        <div>
          <Label htmlFor="sell-method">Método de pago</Label>
          <Select
            id="sell-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as CashMovementMethod)}
            className="mt-1"
          >
            {Object.entries(METHOD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="text-sm text-chalk-muted">
        Total: <strong className="font-mono text-chalk">USD {total.toFixed(2)}</strong>
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirmar venta
        </Button>
      </div>
    </form>
  );
}

function SalesHistory({ getToken }: { getToken: TokenGetter }) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'success'; items: ProductSale[] }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    listProductSales(getToken, { page: 1, pageSize: 30 })
      .then((data) => {
        if (!cancelled) setState({ kind: 'success', items: data.items });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: error instanceof ApiError ? error.message : 'No se pudo cargar el historial',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getToken]);

  if (state.kind === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 py-6 text-sm text-chalk-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando ventas…
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p role="alert" className="py-6 text-sm text-danger">
        {state.message}
      </p>
    );
  }
  if (state.items.length === 0) {
    return <p className="py-6 text-center text-sm text-chalk-muted">Todavía no hay ventas.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-raised font-mono text-[10px] uppercase tracking-wider text-chalk-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">Fecha</th>
            <th className="px-4 py-2.5 font-medium">Producto</th>
            <th className="px-4 py-2.5 font-medium">Cantidad</th>
            <th className="px-4 py-2.5 font-medium">Método</th>
            <th className="px-4 py-2.5 font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {state.items.map((sale) => (
            <tr key={sale.id}>
              <td className="px-4 py-2.5 text-chalk-muted">
                {new Date(sale.createdAt).toLocaleString('es')}
              </td>
              <td className="px-4 py-2.5 text-chalk">{sale.productName}</td>
              <td className="px-4 py-2.5 font-mono text-chalk-muted">{sale.quantity}</td>
              <td className="px-4 py-2.5 text-chalk-muted">{METHOD_LABELS[sale.method]}</td>
              <td className="px-4 py-2.5 font-mono text-chalk">USD {sale.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
