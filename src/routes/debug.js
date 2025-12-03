const express = require('express');
const router = express.Router();
const pool = require('../config/database');

// Return current session (safe for local dev only)
router.get('/session', (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).send('Not found');
    try {
        const safe = {
            user: req.session ? req.session.user : null,
            userId: req.session ? req.session.userId : null,
            role: req.session ? req.session.role : null
        };
        res.json({ success: true, session: safe });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Quick DB test: count products
router.get('/products-count', async (req, res) => {
    if (process.env.NODE_ENV === 'production') return res.status(404).send('Not found');
    try {
        const [rows] = await pool.query('SELECT COUNT(*) as cnt FROM products');
        res.json({ success: true, count: rows[0].cnt });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
