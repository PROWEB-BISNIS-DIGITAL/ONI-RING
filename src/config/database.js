const mysql = require('mysql2');

// Konfigurasi koneksi database
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '', // sesuaikan dengan password MySQL Anda
    database: 'cemilan_ku',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Membuat promise pool untuk async/await
const promisePool = pool.promise();

// Test koneksi
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error connecting to database:', err.message);
        return;
    }
    console.log('✅ Database connected successfully');
    connection.release();
});

module.exports = promisePool;