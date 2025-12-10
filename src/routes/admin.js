const express = require('express');
const router = express.Router();

// Import controllers
const dashboardController = require('../controllers/dashboardController');
const ordersController = require('../controllers/ordersController');
const productsController = require('../controllers/productsController');
const usersController = require('../controllers/usersController');
const keuanganController = require('../controllers/keuanganController');

// Middleware untuk check admin
const { isAdmin } = require('../middleware/authMiddleware');

// Apply middleware ke semua route admin
router.use(isAdmin);

// ============ DASHBOARD ROUTES ============
router.get('/dashboard', dashboardController.getDashboard);

// ============ ORDERS ROUTES ============
router.get('/orders', ordersController.getOrders);
router.get('/orders/:orderId', ordersController.getOrderDetail);
router.put('/orders/:orderId/status', ordersController.updateOrderStatus);

// ============ PRODUCTS ROUTES ============
router.get('/products', productsController.getProducts);
router.post('/products', productsController.addProduct);
router.get('/products/:productId', productsController.getProductById);
router.put('/products/:productId', productsController.updateProduct);
router.delete('/products/:productId', productsController.deleteProduct);
router.post('/products/:productId/toggle-status', productsController.toggleProductStatus);

// ============ USERS ROUTES ============
router.get('/users', usersController.getUsers);
router.get('/users/:userId', usersController.getUserById);
router.post('/users', usersController.addUser);
router.put('/users/:userId', usersController.updateUser);
router.delete('/users/:userId', usersController.deleteUser);
router.post('/users/:userId/toggle-role', usersController.toggleUserRole);
router.post('/users/:userId/toggle-status', usersController.toggleUserStatus);

// ============ MANAJEMEN KEUANGAN (MAIN PAGE) ============
router.get('/managementU', async (req, res) => {
    try {
        const pool = require('../config/database');
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const currentWeek = keuanganController.getWeekNumber(new Date());
        const weekDates = keuanganController.getDateRangeOfWeek(currentWeek, currentYear);
        
        // 1. OMSET HARI INI
        const [omsetHariIniResult] = await pool.execute(
            `SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset_hari_ini,
                COUNT(DISTINCT o.id) as transaksi_hari_ini
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE DATE(o.created_at) = ? 
             AND o.status = 'completed'`,
            [today]
        );
        
        // 2. OMSET KEMARIN
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        const [omsetKemarinResult] = await pool.execute(
            `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as omset_kemarin 
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE DATE(o.created_at) = ? 
             AND o.status = 'completed'`,
            [yesterdayStr]
        );
        
        // 3. OMSET MINGGU INI
        const [omsetMingguIniResult] = await pool.execute(
            `SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset_minggu_ini,
                COUNT(DISTINCT o.id) as transaksi_minggu_ini
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE DATE(o.created_at) BETWEEN ? AND ?
             AND o.status = 'completed'`,
            [weekDates.startDate, weekDates.endDate]
        );
        
        // 4. OMSET BULAN INI
        const [omsetBulanIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as omset_bulan_ini 
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE MONTH(o.created_at) = ? 
             AND YEAR(o.created_at) = ? 
             AND o.status = 'completed'`,
            [currentMonth, currentYear]
        );
        
        // 5. MODAL HARI INI
        const [modalHariIniResult] = await pool.execute(
            `SELECT 
                COALESCE(SUM(products.harga_beli * oi.quantity), 0) as modal_hari_ini,
                COUNT(DISTINCT o.id) as transaksi_hari_ini
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             JOIN products ON products.id = oi.product_id
             WHERE DATE(o.created_at) = ? 
             AND o.status = 'completed'`,
            [today]
        );
        
        // 6. MODAL MINGGU INI
        const [modalMingguIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal_minggu_ini
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN products p ON oi.product_id = p.id
             WHERE DATE(o.created_at) BETWEEN ? AND ?
             AND o.status = 'completed'`,
            [weekDates.startDate, weekDates.endDate]
        );
        
        // 7. MODAL BULAN INI
        const [modalBulanIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal_bulan_ini
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN products p ON oi.product_id = p.id
             WHERE MONTH(o.created_at) = ?
             AND YEAR(o.created_at) = ?
             AND o.status = 'completed'`,
            [currentMonth, currentYear]
        );
        
        // 8. TOTAL TRANSAKSI MINGGU INI
        const [totalTransaksiMingguResult] = await pool.execute(
            `SELECT COUNT(DISTINCT o.id) as total_transaksi_minggu_ini 
             FROM orders o
             WHERE DATE(o.created_at) BETWEEN ? AND ?
             AND o.status = 'completed'`,
            [weekDates.startDate, weekDates.endDate]
        );
        
        // 9. TOTAL TRANSAKSI BULAN INI
        const [totalTransaksiBulanResult] = await pool.execute(
            `SELECT COUNT(DISTINCT o.id) as total_transaksi_bulan_ini 
             FROM orders o
             WHERE MONTH(o.created_at) = ? 
             AND YEAR(o.created_at) = ?
             AND o.status = 'completed'`,
            [currentMonth, currentYear]
        );
        
        // 10. PRODUK TERLARIS MINGGU INI
        const [produkTerlarisResult] = await pool.execute(
            `SELECT 
                p.name as nama_barang,
                SUM(oi.quantity) as total_terjual,
                SUM(oi.price * oi.quantity) as total_omset,
                SUM((oi.price - p.harga_beli) * oi.quantity) as total_laba
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN products p ON oi.product_id = p.id
             WHERE DATE(o.created_at) BETWEEN ? AND ?
             AND o.status = 'completed'
             GROUP BY p.id, p.name
             ORDER BY total_terjual DESC
             LIMIT 5`,
            [weekDates.startDate, weekDates.endDate]
        );
        
        // 11. DATA CHART 7 HARI
        const [trend7HariResult] = await pool.execute(
            `SELECT 
                DATE(o.created_at) as tanggal,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COUNT(DISTINCT o.id) as jumlah_transaksi
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             AND o.status = 'completed'
             GROUP BY DATE(o.created_at)
             ORDER BY tanggal`
        );
        
        // 12. DATA MINGGUAN UNTUK CHART
        const [trendMingguanResult] = await pool.execute(
            `SELECT 
                DATE(o.created_at) as tanggal,
                DAYNAME(o.created_at) as hari,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             JOIN products p ON oi.product_id = p.id
             WHERE DATE(o.created_at) BETWEEN ? AND ?
             AND o.status = 'completed'
             GROUP BY DATE(o.created_at), DAYNAME(o.created_at)
             ORDER BY tanggal`,
            [weekDates.startDate, weekDates.endDate]
        );
        
        // HITUNG DATA
        const omsetHariIni = parseFloat(omsetHariIniResult[0].omset_hari_ini) || 0;
        const omsetKemarin = parseFloat(omsetKemarinResult[0].omset_kemarin) || 0;
        const omsetMingguIni = parseFloat(omsetMingguIniResult[0].omset_minggu_ini) || 0;
        const omsetBulanIni = parseFloat(omsetBulanIniResult[0].omset_bulan_ini) || 0;
        const modalHariIni = parseFloat(modalHariIniResult[0].modal_hari_ini) || 0;
        const modalMingguIni = parseFloat(modalMingguIniResult[0].modal_minggu_ini) || 0;
        const modalBulanIni = parseFloat(modalBulanIniResult[0].modal_bulan_ini) || 0;
        const labaHariIni = omsetHariIni - modalHariIni;
        const labaMingguIni = omsetMingguIni - modalMingguIni;
        const labaBulanIni = omsetBulanIni - modalBulanIni;
        const totalTransaksiMinggu = totalTransaksiMingguResult[0].total_transaksi_minggu_ini || 0;
        const totalTransaksiBulan = totalTransaksiBulanResult[0].total_transaksi_bulan_ini || 0;
        
        // Hitung trend omset
        const trendOmset = omsetKemarin > 0 
            ? parseFloat(((omsetHariIni - omsetKemarin) / omsetKemarin * 100).toFixed(2))
            : 0;
        
        // Hitung margin minggu ini
        let marginMingguIni = 0;
        if (omsetMingguIni > 0) {
            marginMingguIni = (labaMingguIni / omsetMingguIni) * 100;
            marginMingguIni = Math.round(marginMingguIni * 100) / 100;
        }
        
        // Hitung margin bulan ini
        let marginBulanIni = 0;
        if (omsetBulanIni > 0) {
            marginBulanIni = (labaBulanIni / omsetBulanIni) * 100;
            marginBulanIni = Math.round(marginBulanIni * 100) / 100;
        }
        
        // Hitung rata-rata transaksi minggu ini
        const rataTransaksiMinggu = totalTransaksiMinggu > 0
            ? Math.round(omsetMingguIni / totalTransaksiMinggu)
            : 0;
        
        // Total produk terjual minggu ini
        const totalProdukTerjual = produkTerlarisResult.reduce((sum, item) => 
            sum + (item.total_terjual || 0), 0);
        
        // Data untuk view
        const data = {
            // Statistik Cards
            omset_hari_ini: omsetHariIni,
            trend_omset: trendOmset,
            omset_minggu_ini: omsetMingguIni,
            laba_minggu_ini: labaMingguIni,
            margin_minggu_ini: marginMingguIni,
            laba_bulan_ini: labaBulanIni,
            margin_bulan_ini: marginBulanIni,
            total_transaksi_minggu_ini: totalTransaksiMinggu,
            total_transaksi_bulan_ini: totalTransaksiBulan,
            rata_transaksi_minggu_ini: rataTransaksiMinggu,
            
            // Data untuk Charts
            chart_omset: trend7HariResult.map(item => ({
                tanggal: item.tanggal,
                omset: parseFloat(item.omset) || 0
            })),
            
            // Data chart mingguan (7 hari terakhir untuk omset)
            chart_mingguan: trendMingguanResult.map(item => ({
                tanggal: item.tanggal,
                hari: item.hari,
                omset: parseFloat(item.omset) || 0,
                laba: parseFloat(item.laba) || 0
            })),
            
            // Produk Terlaris
            produk_terlaris: produkTerlarisResult.map(item => ({
                nama_barang: item.nama_barang,
                total_terjual: item.total_terjual || 0,
                total_omset: parseFloat(item.total_omset) || 0,
                total_laba: parseFloat(item.total_laba) || 0
            })),
            
            // Summary Data
            total_omset: omsetBulanIni,
            total_laba: labaBulanIni,
            total_transaksi: totalTransaksiBulan,
            total_produk_terjual: totalProdukTerjual,
            
            // Info minggu
            minggu_ke: currentWeek,
            start_date: weekDates.startDate,
            end_date: weekDates.endDate,
            tahun: currentYear
        };
        
        // Render halaman
        res.render('admin/managementU', { 
            title: 'Laporan Keuangan',
            user: req.session.user,
            data: data,
            laporan: []  // Kosong karena tidak menggunakan laporan_keuangan lagi
        });
        
    } catch (error) {
        console.error('Error loading managementU:', error);
        res.status(500).render('error', { 
            message: 'Gagal memuat halaman laporan keuangan',
            error: error
        });
    }
});

// ============ KEUANGAN API ROUTES ============

// Generate Laporan Harian (AJAX) - Tidak digunakan lagi
router.post('/keuangan/generate', keuanganController.generateLaporanHarian);

// Get Laporan (AJAX) - Tidak digunakan lagi
router.get('/keuangan/laporan', keuanganController.getAllLaporan);

// ============ OMSET ROUTES (AJAX) ============
router.get('/keuangan/omset/harian', keuanganController.getOmsetHarian);
router.get('/keuangan/omset/mingguan', keuanganController.getOmsetMingguan);
router.get('/keuangan/omset/bulanan', keuanganController.getOmsetBulanan);
router.get('/keuangan/omset/tahunan', keuanganController.getOmsetTahunan);

// ============ LABA RUGI ROUTES (AJAX) ============
router.get('/keuangan/laba-rugi', keuanganController.getLabaRugi);
router.get('/keuangan/laba-rugi/mingguan', keuanganController.getLabaRugiMingguan);

// ============ DETAIL OMSET ROUTES (AJAX) ============
router.get('/keuangan/detail-omset', keuanganController.getDetailOmset);

// ============ DASHBOARD STATISTIK (AJAX) ============
router.get('/keuangan/dashboard-statistik', keuanganController.getStatistikDashboard);

module.exports = router;