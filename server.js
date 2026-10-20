const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'datos.db');

app.use(cors());
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
    numero INTEGER NOT NULL,
    alfanumerico TEXT NOT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Error al crear la tabla:', err.message);
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/guardar', (req, res) => {
  const numero = Number(req.body.numero);
  const alfanumerico = String(req.body.alfanumerico || '').trim();

  if (!Number.isInteger(numero) || numero < 0) {
    return res.status(400).json({ error: 'El número debe ser un entero positivo' });
  }

  if (!alfanumerico || !/^[A-Za-z0-9]+$/.test(alfanumerico)) {
    return res.status(400).json({ error: 'El campo alfanumérico solo admite letras y números' });
  }

  const sql = 'INSERT INTO ingresos (numero, alfanumerico) VALUES (?, ?)';
  db.run(sql, [numero, alfanumerico], function (err) {
    if (err) {
      console.error('Error al guardar:', err.message);
      return res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }

    return res.status(201).json({
      mensaje: 'Datos guardados correctamente',
      id: this.lastID
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
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log('Abre http://localhost:3000 en el navegador');
});
