// Helpers de respuesta HTTP compartidos por index.ts y las rutas.
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' } as const;

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  });
}

// Formato de error consistente, según CLAUDE.md sección 8.
export function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, { status });
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

// `allowEmpty` cubre endpoints como renovar, donde el cuerpo es opcional (todos los
// campos tienen valor por defecto).
export async function readJsonBody(
  request: Request,
  options: { allowEmpty?: boolean } = {},
): Promise<JsonBodyResult> {
  const raw = await request.text();

  if (raw.trim().length === 0) {
    if (options.allowEmpty) return { ok: true, body: {} };
    return {
      ok: false,
      response: errorResponse(400, 'INVALID_JSON', 'El cuerpo debe ser JSON válido'),
    };
  }

  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return {
      ok: false,
      response: errorResponse(400, 'INVALID_JSON', 'El cuerpo debe ser JSON válido'),
    };
  }
}
