const express = require('express');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pool = require('./config/database');
const { userToLocals } = require('./middleware/authMiddleware');

const app = express();
const port = 3000;

// Konfigurasi session store
const sessionStore = new MySQLStore({
    expiration: 86400000, // 1 hari
    createDatabaseTable: true,
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
}, pool);

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
app.use(session({
    key: 'onin_ring_session',
    secret: 'onin_ring_secret_key_2024',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 1 hari
        httpOnly: true,
        secure: false // true jika HTTPS
    }
}));

// Middleware untuk menyimpan user ke locals
app.use(userToLocals);

// Set view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Import routes
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const debugRoutes = require('./routes/debug');
const ordersPublicRoutes = require('./routes/orders');
// Di app.js atau index.js, tambahkan:

// Routes
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const orderRouter = require('./routes/orders');
const apiRouter = require('./routes/api'); // TAMBAHKAN INI

// Use routes
app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/orders', orderRouter);
app.use('/api', apiRouter); // TAMBAHKAN INI
// Routes
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// Mount debug routes only in non-production for quick checks
if (process.env.NODE_ENV !== 'production') {
    app.use('/debug', debugRoutes);
}

// Public orders endpoint
app.use('/orders', ordersPublicRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { 
        title: 'Halaman Tidak Ditemukan',
        user: req.session.user || null
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).render('error', { 
        title: 'Terjadi Kesalahan',
        error: err.message,
        user: req.session.user || null
    });
});

app.listen(port, () => {
    console.log(`✅ Server berjalan di http://localhost:${port}`);
});