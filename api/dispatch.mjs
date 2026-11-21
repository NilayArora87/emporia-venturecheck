import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

let serve;
export default async function dispatch(req, res) {
  if (!process.env.DATABASE_URL) {
    res.writeHead(503, {'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'Connect an event database in the Vercel project settings.'}));
    return;
  }
  if (!serve) {
    const runtime = pathToFileURL(resolve('src/vercel-runtime.mjs')).href;
    const { createHandler } = await import(runtime);
    serve = createHandler(new pg.Pool({connectionString:process.env.DATABASE_URL, max:2, connectionTimeoutMillis:8000}));
  }
  return serve(req, res);
}
