const imageBaseUrl =
  "https://integration-oic-vtex-bucket.s3.us-east-1.amazonaws.com/B2C-images";

export default async function handler(request, response) {
  try {
    const value = Array.isArray(request.query?.sku) ? request.query.sku[0] : request.query?.sku;
    const sku = String(value ?? "").trim();

    if (!/^[A-Za-z0-9_-]+$/.test(sku)) {
      response.status(400).json({ error: "SKU invalido" });
      return;
    }

    const upstream = await fetch(`${imageBaseUrl}/${encodeURIComponent(sku)}-1.jpg`);
    if (!upstream.ok) {
      response.status(upstream.status).json({ error: "Imagen no encontrada" });
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const data = await upstream.arrayBuffer();

    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    response.setHeader("Content-Type", contentType);
    response.status(200).send(Buffer.from(data));
  } catch {
    response.status(502).json({ error: "No se pudo cargar la imagen" });
  }
}
