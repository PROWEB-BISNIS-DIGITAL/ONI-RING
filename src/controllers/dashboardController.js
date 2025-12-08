// controllers/dashboardController.js
const pool = require('../config/database');

// Dashboard Admin
exports.getDashboard = async (req, res) => {
    try {
        // ===================== STATISTIK ORDERS =====================
        const [orderStatsRows] = await pool.query(`
            SELECT 
                COUNT(*) AS total_orders,
                COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) AS today_orders
            FROM orders
        `);

        const orderStats = orderStatsRows[0] || { total_orders: 0, today_orders: 0 };

        // ===================== STATISTIK PRODUK =====================
        const [productStatsRows] = await pool.query(`
            SELECT 
                COUNT(*) AS total_products,
                COUNT(CASE WHEN status = 'active' THEN 1 END) AS active_products
            FROM products
        `);

        const productStats = productStatsRows[0] || { total_products: 0, active_products: 0 };

        // ===================== STATISTIK USERS =====================
        const [userStatsRows] = await pool.query(`
            SELECT 
                COUNT(*) AS total_users,
                COUNT(CASE WHEN DATE(created_at) >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH) THEN 1 END) AS new_users
            FROM users
            WHERE role = 'user'
        `);

        const userStats = userStatsRows[0] || { total_users: 0, new_users: 0 };

        // ===================== PESANAN TERBARU (UNTUK TABEL) =====================
        // NOTE: HANYA STATUS 'pending' BIAR YANG SUDAH APPROVE/CANCEL GAK MUNCUL LAGI
        const [recentOrders] = await pool.query(`
            SELECT 
                o.id,
                o.customer_name,
                o.customer_phone,
                o.total,
                o.status,
                o.created_at,
                DATE_FORMAT(o.created_at, '%e %b %Y') AS created_at_formatted
            FROM orders o
            WHERE o.status = 'pending'
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        // ===================== PESANAN PENDING (QUICK ACTIONS) =====================
        const [pendingOrders] = await pool.query(`
            SELECT 
                o.id,
                o.customer_name,
                o.customer_phone,
                o.total,
                o.status,
                o.created_at,
                DATE_FORMAT(o.created_at, '%e %b %Y') AS created_at_formatted
            FROM orders o
            WHERE o.status = 'pending'
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        // ===================== DATA UNTUK VIEW =====================
        const stats = {
            totalOrders: orderStats.total_orders || 0,
            todayOrders: orderStats.today_orders || 0,
            totalProducts: productStats.total_products || 0,
            activeProducts: productStats.active_products || 0,
            totalUsers: userStats.total_users || 0,
            newUsers: userStats.new_users || 0
        };

        res.render('admin/dashboard', {
            title: 'Dashboard Admin',
            stats,
            recentOrders,
            pendingOrders,

            // Kalau masih ada EJS lama yang pakai variabel ini, aman
            totalOrders: stats.totalOrders,
            todayOrders: stats.todayOrders,
            totalProducts: stats.totalProducts,
            activeProducts: stats.activeProducts,
            totalUsers: stats.totalUsers,
            newUsers: stats.newUsers
        });
    } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).render('error', {
            message: 'Terjadi kesalahan saat memuat dashboard',
            error: error
        });
    }
};
