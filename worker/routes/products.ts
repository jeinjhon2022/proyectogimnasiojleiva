import type { Env } from '../env';
import { authenticate, requireRole } from '../authenticate';
import { errorResponse, jsonResponse, readJsonBody } from '../http';
import {
  adjustStockSchema,
  createProductSchema,
  listProductSalesQuerySchema,
  listProductsQuerySchema,
  sellProductSchema,
  updateProductSchema,
} from '../validation/products';
import {
  adjustStock,
  createProduct,
  getProductById,
  getProductSalesSummary,
  listProductSales,
  listProducts,
  sellProduct,
  setProductActive,
  updateProduct,
} from '../products-repo';
import { getOpenSession } from '../cash-repo';
import { getGymTimezone, todayInTimezone } from '../gym-settings-repo';

// Productos y stock (PLAN.md — módulo de POS): mismo permiso operativo del día a día
// que socios/pagos/caja (CLAUDE.md sección 5).
const STAFF_ROLES = ['admin', 'receptionist'] as const;

export async function handleListProducts(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver productos');
  }

  const url = new URL(request.url);
  const parsed = listProductsQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Parámetros inválidos',
    );
  }

  const result = await listProducts(env.DB, parsed.data);
  return jsonResponse(result);
}

export async function handleGetProductsSummary(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver el resumen de productos');
  }

  const timezone = await getGymTimezone(env.DB);
  const today = todayInTimezone(timezone);
  const summary = await getProductSalesSummary(env.DB, today);
  return jsonResponse(summary);
}

export async function handleCreateProduct(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para crear productos');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = createProductSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const product = await createProduct(env.DB, parsed.data, auth.user.id);
  return jsonResponse(product, { status: 201 });
}

export async function handleUpdateProduct(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para editar productos');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = updateProductSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const updated = await updateProduct(env.DB, id, parsed.data, auth.user.id);
  if (!updated)
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto indicado');
  return jsonResponse(updated);
}

export async function handleAdjustStock(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ajustar el stock');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = adjustStockSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const result = await adjustStock(env.DB, id, parsed.data.delta, parsed.data.reason, auth.user.id);
  if (result.kind === 'not_found') {
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto indicado');
  }
  if (result.kind === 'would_go_negative') {
    return errorResponse(409, 'STOCK_WOULD_BE_NEGATIVE', 'El ajuste dejaría el stock en negativo');
  }
  return jsonResponse(result.product);
}

export async function handleDeactivateProduct(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para desactivar productos');
  }

  const updated = await setProductActive(env.DB, id, false, auth.user.id);
  if (!updated)
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto indicado');
  return jsonResponse(updated);
}

export async function handleActivateProduct(
  request: Request,
  env: Env,
  id: string,
): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para reactivar productos');
  }

  const updated = await setProductActive(env.DB, id, true, auth.user.id);
  if (!updated)
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto indicado');
  return jsonResponse(updated);
}

// POST /api/products/:id/sell: vende N unidades, descuenta stock y ata la venta a la
// caja abierta si hay una (mismo criterio que pagos — nunca se bloquea por eso).
export async function handleSellProduct(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para registrar ventas');
  }

  const parsedBody = await readJsonBody(request);
  if (!parsedBody.ok) return parsedBody.response;

  const parsed = sellProductSchema.safeParse(parsedBody.body);
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Datos inválidos',
    );
  }

  const product = await getProductById(env.DB, id);
  if (!product)
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto indicado');

  const openCash = await getOpenSession(env.DB);

  const result = await sellProduct(
    env.DB,
    {
      productId: id,
      quantity: parsed.data.quantity,
      method: parsed.data.method,
      cashSessionId: openCash?.id,
    },
    auth.user.id,
  );

  if (result.kind === 'not_found') {
    return errorResponse(404, 'PRODUCT_NOT_FOUND', 'No se encontró el producto indicado');
  }
  if (result.kind === 'inactive') {
    return errorResponse(409, 'PRODUCT_INACTIVE', 'El producto está desactivado');
  }
  if (result.kind === 'insufficient_stock') {
    return errorResponse(
      409,
      'INSUFFICIENT_STOCK',
      `Solo quedan ${result.available} unidades disponibles`,
    );
  }

  return jsonResponse({ sale: result.sale, product: result.product }, { status: 201 });
}

export async function handleListProductSales(request: Request, env: Env): Promise<Response> {
  const auth = await authenticate(request, env);
  if (auth.kind === 'unauthenticated')
    return errorResponse(401, 'UNAUTHENTICATED', 'Se requiere iniciar sesión');
  if (auth.kind === 'unauthorized' || !requireRole(auth.user, STAFF_ROLES)) {
    return errorResponse(403, 'FORBIDDEN', 'No tienes permiso para ver ventas');
  }

  const url = new URL(request.url);
  const parsed = listProductSalesQuerySchema.safeParse({
    page: url.searchParams.get('page') ?? undefined,
    pageSize: url.searchParams.get('pageSize') ?? undefined,
    dateFrom: url.searchParams.get('dateFrom') ?? undefined,
    dateTo: url.searchParams.get('dateTo') ?? undefined,
  });
  if (!parsed.success) {
    return errorResponse(
      422,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Parámetros inválidos',
    );
  }

  const result = await listProductSales(env.DB, parsed.data);
  return jsonResponse(result);
}
