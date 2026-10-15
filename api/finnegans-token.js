'use strict';

// Official contract: https://developers.finneg.com/ (POST + literal Basic SECRET_KEY).
// Never persist credentials, echo upstream errors, or put secrets in query strings.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Usá POST para obtener el token.'});
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) throw new Error('Origin mismatch');
    } catch {
      return res.status(403).json({error: 'La solicitud debe realizarse desde esta aplicación.'});
    }
  }
  if ((req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    return res.status(415).json({error: 'El formato de la solicitud debe ser JSON.'});
  }
  if (Number(req.headers['content-length']) > 12000) {
    return res.status(413).json({error: 'La solicitud es demasiado grande.'});
  }
  let body = req.body;
  try {
    if (typeof body === 'string') {
      if (Buffer.byteLength(body) > 12000) return res.status(413).json({error: 'La solicitud es demasiado grande.'});
      body = JSON.parse(body);
    }
  } catch {
    return res.status(400).json({error: 'La solicitud no contiene JSON válido.'});
  }
  const id = typeof body?.client_id === 'string' ? body.client_id.trim() : '';
  const secret = typeof body?.client_secret === 'string' ? body.client_secret : '';
  if (!id || !secret.trim() || id.length > 512 || secret.length > 4096 || /[\r\n]/.test(id + secret)) {
    return res.status(400).json({error: 'Completá Client_ID y Client_Secret con credenciales válidas.'});
  }
  try {
    const response = await fetch('https://api.finneg.com/api/oauth/token', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        authorization: `Basic ${secret}`,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'text/plain',
      },
      body: new URLSearchParams({grant_type: 'client_credentials', client_id: id}).toString(),
    });
    if (!response.ok) {
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return res.status(401).json({error: 'Finnegans rechazó las credenciales. Revisá Client_ID, Client_Secret y que el usuario esté activo.'});
      }
      if (response.status === 429) return res.status(429).json({error: 'Finnegans recibió demasiadas solicitudes. Esperá unos minutos antes de reintentar.'});
      return res.status(502).json({error: 'Finnegans no está disponible en este momento. Intentá nuevamente más tarde.'});
    }
    const token = (await response.text()).trim();
    if (!token || token.length > 16384 || !/^[A-Za-z0-9._~+\/-]+=*$/.test(token)) {
      return res.status(502).json({error: 'Finnegans devolvió una respuesta de autenticación no válida.'});
    }
    return res.status(200).json({access_token: token, expires_in: 3600});
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({error: 'Finnegans demoró demasiado en responder. Intentá nuevamente.'});
    }
    return res.status(502).json({error: 'No se pudo conectar con Finnegans. Intentá nuevamente más tarde.'});
  }
};
