const express = require('express');
const router = express.Router();

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

module.exports = router;