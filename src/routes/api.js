// routes/api.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');

// GET all active products (for home page)
router.get('/products', async (req, res) => {
    try {
        const [products] = await db.query(`
            SELECT 
                id, 
                name, 
                description, 
                price, 
                image, 
                category, 
                status,
                created_at,
                updated_at
            FROM products
            WHERE status = 'active'
            ORDER BY created_at DESC
        `);
        
        res.json({ 
            success: true, 
            products: products 
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil data produk',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET single product by ID
router.get('/products/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
        const [products] = await db.query(
            'SELECT * FROM products WHERE id = ? AND status = "active"',
            [id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'Produk tidak ditemukan' 
            });
        }
        
        res.json({ 
            success: true, 
            product: products[0] 
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengambil data produk' 
        });
    }
});

module.exports = router;