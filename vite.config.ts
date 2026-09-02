import { defineConfig } from "vite";

const imageBaseUrl =
  "https://integration-oic-vtex-bucket.s3.us-east-1.amazonaws.com/B2C-images";

export default defineConfig({
  plugins: [
    {
      name: "product-image-api",
      configureServer(server) {
        server.middlewares.use("/api/product-image", async (request, response) => {
          try {
            const requestUrl = new URL(request.url ?? "", "http://localhost");
            const sku = String(requestUrl.searchParams.get("sku") ?? "").trim();

            if (!/^[A-Za-z0-9_-]+$/.test(sku)) {
              response.statusCode = 400;
              response.end(JSON.stringify({ error: "SKU invalido" }));
              return;
            }

            const upstream = await fetch(`${imageBaseUrl}/${encodeURIComponent(sku)}-1.jpg`);
            if (!upstream.ok) {
              response.statusCode = upstream.status;
              response.end(JSON.stringify({ error: "Imagen no encontrada" }));
              return;
            }

            response.statusCode = 200;
            response.setHeader("Access-Control-Allow-Origin", "*");
            response.setHeader("Cache-Control", "public, max-age=86400");
            response.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
            response.end(new Uint8Array(await upstream.arrayBuffer()));
          } catch {
            response.statusCode = 502;
            response.end(JSON.stringify({ error: "No se pudo cargar la imagen" }));
          }
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
