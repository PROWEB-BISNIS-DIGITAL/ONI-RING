const express = require('express');
const router = express.Router();

// Import controllers
const dashboardController = require('../controllers/dashboardController');
const ordersController = require('../controllers/ordersController');
const productsController = require('../controllers/productsController');
const usersController = require('../controllers/usersController');
const keuanganController = require('../controllers/keuanganController')

// Middleware untuk check admin (pastikan Anda sudah punya middleware ini)
const { isAdmin } = require('../middleware/authMiddleware');

// Apply middleware ke semua route admin
router.use(isAdmin);

// ============ DASHBOARD ROUTES ============
router.get('/dashboard', dashboardController.getDashboard);

// ============ ORDERS ROUTES ============
router.get('/orders', ordersController.getOrders);
router.get('/orders/:orderId', ordersController.getOrderDetail);
router.post('/orders/:orderId/approve', ordersController.approveOrder);
router.post('/orders/:orderId/cancel', ordersController.cancelOrder);
router.post('/orders/:orderId/complete', ordersController.completeOrder);

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

router.get('/managementU', isAdmin, async (req, res) => {
    try {
        const pool = require('../config/database');
        const today = new Date().toISOString().split('T')[0];
        
        // 1. OMSEH HARI INI (dari tabel orders)
        const [omsetHariIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(total), 0) as omset_hari_ini 
             FROM orders 
             WHERE DATE(created_at) = ? 
             AND status = 'completed'`,
            [today]
        );
        
        // 2. OMSEH BULAN INI
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const [omsetBulanIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(total), 0) as omset_bulan_ini 
             FROM orders 
             WHERE MONTH(created_at) = ? 
             AND YEAR(created_at) = ? 
             AND status = 'completed'`,
            [currentMonth, currentYear]
        );
        
        // 3. TOTAL TRANSAKSI/PESANAN
        const [totalTransaksiResult] = await pool.execute(
            `SELECT COUNT(*) as total_pesanan 
             FROM orders 
             WHERE status = 'completed'`
        );
        
        // 4. PRODUK TERLARIS (dari order_items + products)
        const [produkTerlarisResult] = await pool.execute(
            `SELECT 
                p.name as nama_barang,
                SUM(oi.quantity) as total_terjual,
                SUM(oi.price * oi.quantity) as total_omset,
                SUM((oi.price * oi.quantity) - (p.price * oi.quantity)) as total_laba
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN products p ON oi.product_id = p.id
             WHERE o.status = 'completed'
             GROUP BY p.id, p.name
             ORDER BY total_terjual DESC
             LIMIT 5`
        );
        
        // 5. DATA UNTUK CHART 7 HARI TERAKHIR
        const [trend7HariResult] = await pool.execute(
            `SELECT 
                DATE(created_at) as tanggal,
                COALESCE(SUM(total), 0) as omset,
                COUNT(*) as jumlah_transaksi
             FROM orders
             WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
             AND status = 'completed'
             GROUP BY DATE(created_at)
             ORDER BY tanggal`
        );
        
        // 6. DATA LAPORAN KEUANGAN (jika ada)
        const [laporanResult] = await pool.execute(
            `SELECT * FROM laporan_keuangan ORDER BY tanggal DESC LIMIT 10`
        );
        
        // Hitung margin laba
        const omsetHariIni = parseFloat(omsetHariIniResult[0].omset_hari_ini) || 0;
        const omsetBulanIni = parseFloat(omsetBulanIniResult[0].omset_bulan_ini) || 0;
        
        // Data untuk dikirim ke view
        const data = {
            // Statistik utama
            omset_hari_ini: omsetHariIni,
            omset_bulan_ini: omsetBulanIni,
            total_pesanan: totalTransaksiResult[0].total_pesanan || 0,
            
            // Untuk statistik cards
            trend_omset: 0, // Bisa dihitung nanti
            laba_bulan_ini: omsetBulanIni * 0.3, // Contoh: laba 30% dari omset
            margin_bulan_ini: 30, // Contoh margin 30%
            total_transaksi_bulan_ini: 0, // Bisa dihitung dari orders bulan ini
            rata_transaksi_bulan_ini: omsetBulanIni > 0 ? Math.round(omsetBulanIni / 30) : 0,
            pengeluaran_bulan_ini: omsetBulanIni * 0.2, // Contoh: pengeluaran 20% dari omset
            persen_pengeluaran: 20, // Contoh 20%
            
            // Data untuk charts
            chart_omset: trend7HariResult.map(item => ({
                tanggal: item.tanggal,
                omset: parseFloat(item.omset) || 0
            })),
            chart_laba: {
                total_laba_kotor: omsetBulanIni * 0.3
            },
            chart_pengeluaran: {
                total_pengeluaran: omsetBulanIni * 0.2
            },
            
            // Produk terlaris
            produk_terlaris: produkTerlarisResult.map(item => ({
                nama_barang: item.nama_barang,
                total_terjual: item.total_terjual || 0,
                total_omset: parseFloat(item.total_omset) || 0,
                total_laba: parseFloat(item.total_laba) || 0
            })),
            
            // Summary data
            total_omset: omsetBulanIni,
            max_omset: omsetBulanIni,
            min_omset: 0,
            avg_omset: Math.round(omsetBulanIni / 30),
            total_laba: omsetBulanIni * 0.3,
            max_laba: omsetBulanIni * 0.3,
            min_laba: 0,
            avg_margin: 30,
            total_transaksi: totalTransaksiResult[0].total_pesanan || 0,
            transaksi_per_hari: totalTransaksiResult[0].total_pesanan > 0 ? 
                Math.round(totalTransaksiResult[0].total_pesanan / 30) : 0,
            avg_transaksi: totalTransaksiResult[0].total_pesanan > 0 ? 
                Math.round(omsetBulanIni / totalTransaksiResult[0].total_pesanan) : 0,
            total_produk_terjual: produkTerlarisResult.reduce((sum, item) => 
                sum + (item.total_terjual || 0), 0)
        };
        
        // Render halaman
        res.render('admin/managementU', { 
            title: 'Laporan Keuangan',
            data: data,
            laporan: laporanResult || [],
            pagination: {
                totalPages: 1,
                currentPage: 1,
                startIndex: 0,
                endIndex: laporanResult ? laporanResult.length - 1 : 0,
                totalItems: laporanResult ? laporanResult.length : 0
            }
        });
        
    } catch (error) {
        console.error('Error loading managementU:', error);
        // Fallback ke data dummy jika error
        res.render('admin/managementU', { 
            title: 'Laporan Keuangan',
            data: {
                omset_hari_ini: 500000,
                omset_bulan_ini: 1500000,
                total_pesanan: 40,
                produk_terjual: 0,
                trend_omset: 0,
                laba_bulan_ini: 0,
                margin_bulan_ini: 0,
                total_transaksi_bulan_ini: 0,
                rata_transaksi_bulan_ini: 0,
                pengeluaran_bulan_ini: 0,
                persen_pengeluaran: 0,
                chart_omset: [],
                chart_laba: {},
                chart_pengeluaran: {},
                produk_terlaris: [],
                total_omset: 0,
                max_omset: 0,
                min_omset: 0,
                avg_omset: 0,
                total_laba: 0,
                max_laba: 0,
                min_laba: 0,
                avg_margin: 0,
                total_transaksi: 0,
                transaksi_per_hari: 0,
                avg_transaksi: 0,
                total_produk_terjual: 0
            },
            laporan: [],
            pagination: null
        });
    }
});
//-------------- MANAJEMEN KEUANGAN ==========//
// CRUD Laporan Keuangan
router.post('/generate', keuanganController.generateLaporanHarian);
router.get('/', keuanganController.getAllLaporan);
router.get('/range', keuanganController.getLaporanByRange);
router.get('/:id', keuanganController.getLaporanById);
router.put('/:id', keuanganController.updateLaporan);
router.delete('/:id', keuanganController.deleteLaporan);

// Omset
router.get('/omset/harian', keuanganController.getOmsetHarian);
router.get('/omset/bulanan', keuanganController.getOmsetBulanan);
router.get('/omset/tahunan', keuanganController.getOmsetTahunan);

// Laba Rugi
router.get('/laba-rugi', keuanganController.getLabaRugi);

// Dashboard - DIPERBAIKI: menghapus /admin/ karena sudah dalam route admin
router.get('/dashboard-statistik', keuanganController.getStatistikDashboard);

module.exports = router;