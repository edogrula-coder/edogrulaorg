// backend/app.js — Ultra Pro thin wrapper
// Amaç: Serverless (Vercel vb.) ortamlar "app.js" aradığında,
// server.js içindeki Express app'i side-effect olmadan dışa vermek.
//
// NOT: server.js içinde listen() çağrısı mutlaka
// "sadece doğrudan çalıştırıldığında" tetiklenmeli.
// (örn. import.meta.url === `file://${process.argv[1]}` guard'ı)

import * as server from "./server.js";

// server.js şu üç ihtimalden birini yapıyor olabilir:
// 1) export const app = express();
// 2) export default app
// 3) module default olarak app'i döndürür (nadiren)
// Hepsini güvenli şekilde yakalıyoruz.
const app = server.app || server.default;

if (!app || typeof app !== "function") {
  throw new Error(
    "[app.js] server.js Express app export etmiyor. " +
      "server.js içinde `export const app = ...` veya `export default app` olmalı."
  );
}

export { app };
export default app;
