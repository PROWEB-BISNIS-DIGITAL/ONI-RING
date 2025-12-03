const db = require('../config/database');

// Halaman Products
exports.getProducts = async (req, res) => {
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
            ORDER BY created_at DESC
        `);

        res.render('admin/products', {
            title: 'Manajemen Produk',
            products: products
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).render('error', {
            message: 'Terjadi kesalahan saat memuat data produk',
            error: error
        });
    }
};

// Add Product
exports.addProduct = async (req, res) => {
    const { name, description, price, image, category, status } = req.body;
    
    try {
        const [result] = await db.query(`
            INSERT INTO products (name, description, price, image, category, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [name, description, price, image, category, status]);

        res.json({ 
            success: true, 
            message: 'Produk berhasil ditambahkan!',
            productId: result.insertId 
        });
    } catch (error) {
        console.error('Error adding product:', error);
        res.status(500).json({ success: false, message: 'Gagal menambahkan produk' });
    }
};

// Get Product by ID
exports.getProductById = async (req, res) => {
    const { productId } = req.params;
    
    try {
        const [products] = await db.query(`
            SELECT * FROM products WHERE id = ?
        `, [productId]);

        if (products.length === 0) {
            return res.status(404).json({ success: false, message: 'Produk tidak ditemukan' });
        }

        res.json({ success: true, product: products[0] });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data produk' });
    }
};

// Update Product
exports.updateProduct = async (req, res) => {
    const { productId } = req.params;
    const { name, description, price, image, category, status } = req.body;
    
    try {
        await db.query(`
            UPDATE products 
            SET name = ?, description = ?, price = ?, image = ?, category = ?, status = ?, updated_at = NOW()
            WHERE id = ?
        `, [name, description, price, image, category, status, productId]);

        res.json({ success: true, message: 'Produk berhasil diperbarui!' });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui produk' });
    }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
    const { productId } = req.params;
    
    try {
        // Check if product is used in any orders
        const [orderItems] = await db.query(`
            SELECT COUNT(*) as count FROM order_items WHERE product_id = ?
        `, [productId]);

        if (orderItems[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Produk tidak dapat dihapus karena sudah ada dalam pesanan' 
            });
        }

        await db.query(`
            DELETE FROM products WHERE id = ?
        `, [productId]);

        res.json({ success: true, message: 'Produk berhasil dihapus!' });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus produk' });
    }
};

// Toggle Product Status
exports.toggleProductStatus = async (req, res) => {
    const { productId } = req.params;
    
    try {
        await db.query(`
            UPDATE products 
            SET status = CASE 
                WHEN status = 'active' THEN 'inactive' 
                ELSE 'active' 
            END,
            updated_at = NOW()
            WHERE id = ?
        `, [productId]);

        res.json({ success: true, message: 'Status produk berhasil diubah!' });
    } catch (error) {
        console.error('Error toggling product status:', error);
        res.status(500).json({ success: false, message: 'Gagal mengubah status produk' });
    }
};