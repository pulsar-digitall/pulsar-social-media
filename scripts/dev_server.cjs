// Servidor estatico de desenvolvimento (Node, com suporte a Range para video).
// Serve a raiz do projeto. Uso:  node scripts/dev_server.cjs   ->  http://localhost:8000/
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT ? Number(process.env.PORT) : 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/x-m4v",
};

http.createServer(function (req, res) {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = path.join(ROOT, rel);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) { res.writeHead(404); res.end("Nao encontrado: " + rel); return; }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const range = req.headers.range;
    if (range && /video/.test(type)) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = parseInt(m[1], 10);
      const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
      res.writeHead(206, {
        "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": type,
      });
      fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
      fs.createReadStream(filePath).pipe(res);
    }
  });
}).listen(PORT, function () {
  console.log("Pulsar Social Media no ar: http://localhost:" + PORT + "/");
});
