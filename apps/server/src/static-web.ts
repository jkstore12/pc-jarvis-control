import fs from "node:fs";
import path from "node:path";
import express, { type Express } from "express";

export function serveStaticWeb(app: Express, staticWebDir?: string) {
  if (!staticWebDir) {
    console.info("Static web serving disabled. Set STATIC_WEB_DIR to serve the web build from the server.");
    return;
  }

  const resolvedDir = path.resolve(staticWebDir);
  const indexPath = path.join(resolvedDir, "index.html");

  if (!fs.existsSync(indexPath)) {
    console.warn(`Static web directory is missing index.html: ${resolvedDir}`);
    return;
  }

  app.use(express.static(resolvedDir, {
    index: false,
    maxAge: "1h"
  }));

  app.get(/^(?!\/api\/|\/socket\.io\/|\/health$).*/, (_req, res) => {
    res.sendFile(indexPath);
  });

  console.info(`Serving web app from ${resolvedDir}.`);
}
