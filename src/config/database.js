const mysql = require('mysql2/promise');

const dbConfig = {
    host: 'localhost',
    user: 'root', // ganti dengan username MySQL Anda
    password: '', // ganti dengan password MySQL Anda
    database: 'cemilan_ku',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Test connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL database');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err.message);
    });

module.exports = pool;