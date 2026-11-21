import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { password } from './db.ts';
import { application } from './server.ts';

const live = 'live';
const schema = 'CREATE TABLE IF NOT EXISTS vc_event_images (name text PRIMARY KEY, image bytea NOT NULL)';
const writeImage = 'INSERT INTO vc_event_images(name,image) VALUES ($1,$2) ON CONFLICT(name) DO UPDATE SET image=EXCLUDED.image';

function bootstrap(db) {
  if (db.prepare("SELECT 1 FROM users WHERE role='organizer'").get()) return;
  const email = process.env.VC_ADMIN_EMAIL?.trim().toLowerCase();
  const secret = process.env.VC_ADMIN_PASSWORD;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !secret || secret.length < 12 || secret.length > 200)
    throw Error('Organizer credentials need configuration.');
  db.prepare("INSERT INTO users VALUES (?,?,?,?, 'organizer')").run(randomUUID(), 'Event Organizer', email, password(secret));
}

async function requestStream(req) {
  let bytes;
  if (req.body !== undefined) {
    bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  } else {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 400000) throw Object.assign(Error('Request exceeds the size limit.'), {status:413});
      chunks.push(Buffer.from(chunk));
    }
    bytes = Buffer.concat(chunks);
  }
  if (bytes.length > 400000) throw Object.assign(Error('Request exceeds the size limit.'), {status:413});
  const url = new URL(req.url, 'https://event.local');
  if (url.pathname === '/api/dispatch') {
    url.pathname = '/api/' + (url.searchParams.get('vcroute') || '');
  }
  url.searchParams.delete('vcroute');
  const incoming = Readable.from(bytes.length ? [bytes] : []);
  return Object.assign(incoming, {
    url: url.pathname + url.search, method:req.method, headers:req.headers,
    socket:{remoteAddress:String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()}
  });
}

function bufferedResponse() {
  return {
    status:200, headers:{}, data:'', headersSent:false,
    setHeader(key, value) { this.headers[key] = value; },
    writeHead(status, headers) { this.status = status; Object.assign(this.headers, headers); this.headersSent = true; },
    end(data) { this.data = data ?? ''; }
  };
}

// A single college event fits in one compressed database image. Postgres serializes
// writers across function instances. Readers see the last fully committed image.
export function createHandler(pool) {
  let initialized;
  function initialize() {
    if (!initialized) initialized = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(551001)');
        await client.query(schema);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK'); throw error;
      } finally { client.release(); }
    })().catch(error => { initialized = undefined; throw error; });
    return initialized;
  }
  return async function serve(req, res) {
    let client, directory, db;
    try {
      if (process.env.VC_DEMO === '1') throw Error('Cloud event requires real-event mode.');
      const incoming = await requestStream(req);
      if (!['GET','POST'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      await initialize();
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '15s'");
      const lock = () => client.query('SELECT pg_advisory_xact_lock(551002)');
      let write = req.method === 'POST';
      if (write) await lock();
      const load = async () => (await client.query('SELECT image FROM vc_event_images WHERE name=$1',[live])).rows[0]?.image;
      let image = await load();
      if (!image && !write) {
        await lock(); image = await load(); write = !image;
      }
      directory = await realpath(await mkdtemp(join(tmpdir(),'venturecheck-')));
      const path = join(directory, 'event.sqlite');
      if (image) await writeFile(path, gunzipSync(image), {mode:0o600});
      const app = application(path);
      db = app.db;
      if (!image) bootstrap(db);
      const response = bufferedResponse();
      await app.handle(incoming, response);
      if (write) {
        // Preserve reset backups alongside the live image in the same transaction.
        for (const row of db.prepare('SELECT request_id,backup_file FROM reset_receipts WHERE backup_file LIKE ?').all(directory+'/%')) {
          const name = 'before-reset-' + row.request_id;
          await client.query(writeImage,[name,gzipSync(await readFile(row.backup_file))]);
          db.prepare('UPDATE reset_receipts SET backup_file=? WHERE request_id=?').run(name,row.request_id);
          response.data = JSON.stringify({backup:name});
        }
      }
      db.close(); db = undefined;
      if (write) await client.query(writeImage,[live,gzipSync(await readFile(path))]);
      await client.query('COMMIT');
      res.writeHead(response.status, response.headers);
      res.end(response.data);
    } catch (error) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      console.error('Cloud request failed:', error.code || error.name);
      res.writeHead(error.status || 503, {'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({error:error.status === 413 ? error.message : 'The event database is unavailable. Please retry.'}));
    } finally {
      client?.release();
      db?.close();
      if (directory) await rm(directory, {recursive:true, force:true});
    }
  };
}
