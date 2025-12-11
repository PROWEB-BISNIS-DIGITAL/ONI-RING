const express = require('express');
const router = express.Router();
const authRoutes = require('./auth');
const adminRoutes = require('./admin');
const orderRoutes = require('./orders');

// Public routes
router.use('/auth', authRoutes);
router.use('/orders', orderRoutes); // Tambahkan ini

// Admin routes (protected)
router.use('/admin', adminRoutes);

module.exports = router;
// Route utama - Tampilkan halaman home
router.get('/', (req, res) => {
    res.render('home', {
        title: 'Cemal-Cemil - Home',
        user: req.session.user || null
    });
});

// Route untuk about
router.get('/about', (req, res) => {
    res.render('about', {
        title: 'Tentang Kami - Cemal-Cemil',
        user: req.session.user || null
    });
});

// Route untuk contact
router.get('/contact', (req, res) => {
    res.render('contact', {
        title: 'Kontak - Cemal-Cemil',
        user: req.session.user || null
    });
});

router.get('/Sosial-media', (req, res) => {
    res.render('sosial-media', {
        title: 'selamat datang di web kami',
        user: req.session.user || null
    });
});


module.exports = router;