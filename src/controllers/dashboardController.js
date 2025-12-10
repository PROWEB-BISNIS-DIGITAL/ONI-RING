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

        // ===================== STATISTIK MINGGUAN (MENGGUNAKAN LOGIKA DARI LAPORAN) =====================
        // Gunakan fungsi dari laporanController untuk menghitung minggu ini
        const currentWeek = getWeekNumber(new Date());
        const currentYear = new Date().getFullYear();
        const weekDates = getDateRangeOfWeek(currentWeek, currentYear);
        
        // Total transaksi minggu ini
        const [weeklyTransaksiRows] = await pool.query(`
            SELECT 
                COUNT(DISTINCT o.id) AS total_transaksi_minggu_ini,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS omset_minggu_ini
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
        `, [weekDates.startDate, weekDates.endDate]);

        const weeklyTransaksi = weeklyTransaksiRows[0] || { 
            total_transaksi_minggu_ini: 0, 
            omset_minggu_ini: 0 
        };

        // Rata-rata transaksi minggu ini
        const [avgTransaksiRows] = await pool.query(`
            SELECT 
                COALESCE(AVG(sub.total_per_order), 0) AS rata_transaksi_minggu_ini
            FROM (
                SELECT 
                    o.id,
                    SUM(oi.price * oi.quantity) AS total_per_order
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                WHERE DATE(o.created_at) BETWEEN ? AND ?
                AND o.status = 'completed'
                GROUP BY o.id
            ) AS sub
        `, [weekDates.startDate, weekDates.endDate]);

        const avgTransaksi = avgTransaksiRows[0] || { rata_transaksi_minggu_ini: 0 };

        // Transaksi hari ini
        const today = new Date().toISOString().split('T')[0];
        const [todayStatsRows] = await pool.query(`
            SELECT 
                COUNT(DISTINCT o.id) AS transaksi_hari_ini,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS omset_hari_ini
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
        `, [today]);

        const todayStats = todayStatsRows[0] || { 
            transaksi_hari_ini: 0, 
            omset_hari_ini: 0 
        };

        // Hitung laba dan margin (menggunakan logika dari laporanController)
        const [labaRows] = await pool.query(`
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) AS pendapatan,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) AS hpp,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) AS laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
        `, [weekDates.startDate, weekDates.endDate]);

        const labaData = labaRows[0] || { pendapatan: 0, hpp: 0, laba_kotor: 0 };
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
        const laba_bersih = parseFloat(labaData.laba_kotor) || 0;
        
        // Hitung margin laba
        const pendapatan = parseFloat(labaData.pendapatan) || 0;
        let margin_minggu_ini = 0;
        if (pendapatan > 0) {
            margin_minggu_ini = (laba_bersih / pendapatan) * 100;
        }

        // ===================== PESANAN TERBARU =====================
        const [recentOrders] = await pool.query(`
            SELECT 
                o.id,
                o.customer_name,
                o.customer_phone,
                o.customer_email,
                o.total,
                o.status,
                o.order_number,
                o.created_at,
                DATE_FORMAT(o.created_at, '%e %b %Y') AS created_at_formatted,
                DATE_FORMAT(o.created_at, '%H:%i') AS time_formatted,
                (
                    SELECT COUNT(*) 
                    FROM order_items oi 
                    WHERE oi.order_id = o.id
                ) AS item_count
            FROM orders o
            WHERE o.status NOT IN ('cancelled')
            ORDER BY o.created_at DESC
            LIMIT 10
        `);

        // ===================== DATA UNTUK VIEW =====================
        const stats = {
            // Stats umum (yang sudah ada)
            totalOrders: orderStats.total_orders || 0,
            todayOrders: orderStats.today_orders || 0,
            totalProducts: productStats.total_products || 0,
            activeProducts: productStats.active_products || 0,
            totalUsers: userStats.total_users || 0,
            newUsers: userStats.new_users || 0,
            
            // Stats mingguan (SESUAI DENGAN FRONTEND)
            total_transaksi_minggu_ini: parseInt(weeklyTransaksi.total_transaksi_minggu_ini) || 0,
            transaksi_hari_ini: parseInt(todayStats.transaksi_hari_ini) || 0,
            omset_minggu_ini: parseFloat(weeklyTransaksi.omset_minggu_ini) || 0,
            omset_hari_ini: parseFloat(todayStats.omset_hari_ini) || 0,
            rata_transaksi_minggu_ini: parseFloat(avgTransaksi.rata_transaksi_minggu_ini) || 0,
            laba_minggu_ini: laba_bersih,
            margin_minggu_ini: margin_minggu_ini
        };

        // Debug log
        console.log('📊 Dashboard Stats:', JSON.stringify(stats, null, 2));
        console.log('📅 Minggu Ini:', currentWeek, 'Tahun:', currentYear);
        console.log('📆 Rentang Tanggal:', weekDates.startDate, 's/d', weekDates.endDate);

        res.render('admin/dashboard', {
            title: 'Dashboard Admin',
            stats,
            recentOrders,
            // Variabel lama untuk kompatibilitas
            totalOrders: stats.totalOrders,
            todayOrders: stats.todayOrders,
            totalProducts: stats.totalProducts,
            activeProducts: stats.activeProducts,
            totalUsers: stats.totalUsers,
            newUsers: stats.newUsers
        });

    } catch (error) {
        console.error('❌ Error fetching dashboard data:', error);
        console.error('❌ Error Stack:', error.stack);
        res.status(500).render('error', {
            message: 'Terjadi kesalahan saat memuat dashboard',
            error: req.app.get('env') === 'development' ? error : {}
        });
    }
};

// ===================== HELPER FUNCTIONS =====================
// (Copy dari laporanController.js)

// Fungsi untuk mendapatkan nomor minggu dalam tahun
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Fungsi untuk mendapatkan tanggal awal dan akhir minggu
function getDateRangeOfWeek(weekNo, year) {
    const janFirst = new Date(year, 0, 1);
    const days = (weekNo - 1) * 7;
    const firstDay = new Date(janFirst.getTime() + days * 24 * 60 * 60 * 1000);
    
    // Adjust to Monday
    const dayOfWeek = firstDay.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(firstDay.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
    
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);
    
    return {
        startDate: monday.toISOString().split('T')[0],
        endDate: sunday.toISOString().split('T')[0]
    };
}