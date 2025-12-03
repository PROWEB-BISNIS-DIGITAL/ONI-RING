const pool = require('../config/database');

// Dashboard Admin
exports.getDashboard = async (req, res) => {
    try {
        // Ambil statistik dari database
        const [orderStats] = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_orders
            FROM orders
        `);

        const [productStats] = await pool.query(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as active_products
            FROM products
        `);

        const [userStats] = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) THEN 1 END) as new_users
            FROM users
            WHERE role = 'user'
        `);

        // Ambil pesanan terbaru dengan status pending (untuk tabel)
        const [recentOrders] = await pool.query(`
            SELECT 
                o.id,
                o.customer_name,
                o.customer_phone,
                o.total,
                o.status,
                o.created_at
            FROM orders o
            WHERE o.status = 'pending'
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        res.render('admin/dashboard', {
            title: 'Dashboard Admin',
            totalOrders: orderStats[0].total_orders,
            todayOrders: orderStats[0].today_orders,
            totalProducts: productStats[0].total_products,
            activeProducts: productStats[0].active_products,
            totalUsers: userStats[0].total_users,
            newUsers: userStats[0].new_users,
            recentOrders: recentOrders
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).render('error', {
            message: 'Terjadi kesalahan saat memuat dashboard',
            error: error
        });
    }
};

// Approve Order (dipanggil via AJAX)
exports.approveOrder = async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await pool.query(`
            UPDATE orders 
            SET status = 'confirmed', updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({ success: true, message: 'Pesanan berhasil diapprove!' });
    } catch (error) {
        console.error('Error approving order:', error);
        res.status(500).json({ success: false, message: 'Gagal approve pesanan' });
    }
};

// Cancel Order (dipanggil via AJAX)
exports.cancelOrder = async (req, res) => {
    const { orderId } = req.params;
    
    try {
        await pool.query(`
            UPDATE orders 
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({ success: true, message: 'Pesanan berhasil dibatalkan!' });
    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, message: 'Gagal cancel pesanan' });
    }
};