/**
 * Backend simple con Node.js + Express + SQLite
 * Guarda el número y el alfanumérico en una base de datos local.
 *
 * Cómo usarlo:
 * 1. npm install
 * 2. node server.js
 * 3. Abre index.html o sirve la carpeta con un servidor estático
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // permite que el frontend en otro origen llame a la API
app.use(express.json());
app.use(express.static(path.join(__dirname))); // sirve index.html automáticamente

// Conectar / crear base de datos
const db = new sqlite3.Database('./datos.db', (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
  } else {
    console.log('Conectado a SQLite.');
  }
});

// Crear tabla si no existe
db.run(`
  CREATE TABLE IF NOT EXISTS ingresos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER NOT NULL,
    alfanumerico TEXT NOT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Ruta para guardar datos
app.post('/guardar', (req, res) => {
  const { numero, alfanumerico } = req.body;

  // Validación del lado del servidor
  if (numero === undefined || numero === null || isNaN(numero) || Number(numero) < 0) {
    return res.status(400).json({ error: 'El número debe ser un entero positivo' });
  }

  if (!alfanumerico || !/^[A-Za-z0-9]+$/.test(alfanumerico)) {
    return res.status(400).json({ error: 'El campo alfanumérico solo admite letras y números' });
  }

  const sql = `INSERT INTO ingresos (numero, alfanumerico) VALUES (?, ?)`;
  db.run(sql, [Number(numero), alfanumerico], function (err) {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al guardar en la base de datos' });
    }

    res.status(201).json({
      mensaje: 'Datos guardados correctamente',
      id: this.lastID
    });
  });
});

// Ruta opcional para ver todos los registros (útil para pruebas)
app.get('/registros', (req, res) => {
  db.all('SELECT * FROM ingresos ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log('Abre http://localhost:3000 en el navegador');
});
