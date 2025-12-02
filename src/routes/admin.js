const express = require('express');
const router = express.Router();
const { isAdmin } = require('../middleware/authMiddleware');

// Admin dashboard (hanya admin yang bisa akses)
router.get('/dashboard', isAdmin, (req, res) => {
    res.render('admin/dashboard', {
        title: 'Admin Dashboard - Cemal-Cemil',
        user: req.session.user
    });
});

// Admin products management
router.get('/product', isAdmin, (req, res) => {
    res.render('admin/product', {
        title: 'Kelola Produk - Cemal-Cemil',
        user: req.session.user
    });
});

// Admin orders management
router.get('/orders', isAdmin, (req, res) => {
    res.render('admin/orders', {
        title: 'Kelola Pesanan - Cemal-Cemil',
        user: req.session.user
    });
});

// Admin users management
router.get('/users', isAdmin, (req, res) => {
    res.render('admin/users', {
        title: 'Kelola Pengguna - Cemal-Cemil',
        user: req.session.user
    });
});

// Admin messages/contact
router.get('/messages', isAdmin, (req, res) => {
    res.render('admin/messages', {
        title: 'Pesan Masuk - Cemal-Cemil',
        user: req.session.user
    });
});

// Admin settings
router.get('/settings', isAdmin, (req, res) => {
    res.render('admin/settings', {
        title: 'Pengaturan - Cemal-Cemil',
        user: req.session.user
    });
});

module.exports = router;