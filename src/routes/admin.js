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
        
        // 1. OMSET HARI INI - FIXED: pakai order_items
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
        
        // 3. OMSET BULAN INI - FIXED
        const [omsetBulanIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(oi.price * oi.quantity), 0) as omset_bulan_ini 
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE MONTH(o.created_at) = ? 
             AND YEAR(o.created_at) = ? 
             AND o.status = 'completed'`,
            [currentMonth, currentYear]
        );
        
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
        // 4. MODAL BULAN INI
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
        
        // 4.5 PENGELUARAN BULAN INI - NEW
        const [pengeluaranBulanIniResult] = await pool.execute(
            `SELECT COALESCE(SUM(total_pengeluaran), 0) as pengeluaran_bulan_ini
             FROM laporan_keuangan
             WHERE MONTH(tanggal) = ?
             AND YEAR(tanggal) = ?`,
            [currentMonth, currentYear]
        );
        
        // 5. TOTAL TRANSAKSI BULAN INI
        const [totalTransaksiBulanResult] = await pool.execute(
            `SELECT COUNT(DISTINCT o.id) as total_transaksi_bulan_ini 
             FROM orders o
             WHERE MONTH(o.created_at) = ? 
             AND YEAR(o.created_at) = ?
             AND o.status = 'completed'`,
            [currentMonth, currentYear]
        );
        
        // 6. PRODUK TERLARIS - SUDAH BENAR
        const [produkTerlarisResult] = await pool.execute(
            `SELECT 
                p.name as nama_barang,
                SUM(oi.quantity) as total_terjual,
                SUM(oi.price * oi.quantity) as total_omset,
                SUM((oi.price - p.price) * oi.quantity) as total_laba
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.id
             JOIN products p ON oi.product_id = p.id
             WHERE MONTH(o.created_at) = ?
             AND YEAR(o.created_at) = ?
             AND o.status = 'completed'
             GROUP BY p.id, p.name
             ORDER BY total_terjual DESC
             LIMIT 5`,
            [currentMonth, currentYear]
        );
        
        // 7. DATA CHART 7 HARI - FIXED
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
        
        // 8. DATA LAPORAN KEUANGAN
        let laporanResult = [];
        try {
            const [results] = await pool.execute(`
                SELECT 
                    id,
                    tanggal,
                    total_penjualan,
                    CAST(omset AS DECIMAL(15,2)) as omset,
                    CAST(total_modal AS DECIMAL(15,2)) as total_modal,
                    CAST(total_pengeluaran AS DECIMAL(15,2)) as total_pengeluaran,
                    CAST(laba AS DECIMAL(15,2)) as laba,
                    keterangan,
                    created_at
                FROM laporan_keuangan 
                ORDER BY tanggal DESC 
                LIMIT 30
            `);
            
            laporanResult = results.map(item => {
                const omset = parseFloat(item.omset) || 0;
                const laba = parseFloat(item.laba) || 0;
                const margin = omset > 0 ? (laba / omset) * 100 : 0;
                
                return {
                    ...item,
                    margin_percent: Math.round(margin * 100) / 100
                };
            });
            
        } catch (error) {
            console.error('❌ Error loading laporan:', error.message);
            laporanResult = [];
        }
        
        // HITUNG DATA
        const omsetHariIni = parseFloat(omsetHariIniResult[0].omset_hari_ini) || 0;
        const omsetKemarin = parseFloat(omsetKemarinResult[0].omset_kemarin) || 0;
        const omsetBulanIni = parseFloat(omsetBulanIniResult[0].omset_bulan_ini) || 0;
        const modalHariIni = parseFloat(modalHariIniResult[0].modal_hari_ini) || 0;
        const modalBulanIni = parseFloat(modalBulanIniResult[0].modal_bulan_ini) || 0;
        const pengeluaranBulanIni = parseFloat(pengeluaranBulanIniResult[0].pengeluaran_bulan_ini) || 0;
        // const labaBulanIni = omsetBulanIni - modalBulanIni - pengeluaranBulanIni;
        const labaBulanIni = omsetHariIni - modalHariIni;
        const totalTransaksiBulan = totalTransaksiBulanResult[0].total_transaksi_bulan_ini || 0;
        
        // Hitung trend omset
        const trendOmset = omsetKemarin > 0 
            ? parseFloat(((omsetHariIni - omsetKemarin) / omsetKemarin * 100).toFixed(2))
            : 0;
        
        // Hitung margin bulan ini
        let marginBulanIni = 0;
        if (omsetBulanIni > 0) {
            marginBulanIni = (labaBulanIni / omsetBulanIni) * 100;
            marginBulanIni = Math.round(marginBulanIni * 100) / 100;
        }
        
        // Hitung rata-rata transaksi
        const rataTransaksi = totalTransaksiBulan > 0
            ? Math.round(omsetBulanIni / totalTransaksiBulan)
            : 0;
        
        // Total produk terjual
        const totalProdukTerjual = produkTerlarisResult.reduce((sum, item) => 
            sum + (item.total_terjual || 0), 0);
        
        // Data untuk view - FIXED: hapus JSON.stringify
        const data = {
            // Statistik Cards
            omset_hari_ini: omsetHariIni,
            trend_omset: trendOmset,
            laba_bulan_ini: labaBulanIni,
            margin_bulan_ini: marginBulanIni,
            total_transaksi_bulan_ini: totalTransaksiBulan,
            rata_transaksi_bulan_ini: rataTransaksi,
            pengeluaran_bulan_ini: pengeluaranBulanIni,
            persen_pengeluaran: omsetBulanIni > 0 ? (pengeluaranBulanIni / omsetBulanIni) * 100 : 0,
            
            // Data untuk Charts - FIXED: kirim as object, bukan string
            chart_omset: trend7HariResult.map(item => ({
                tanggal: item.tanggal,
                omset: parseFloat(item.omset) || 0
            })),
            chart_laba: {
                total_laba_kotor: labaBulanIni + pengeluaranBulanIni // Laba sebelum pengeluaran
            },
            chart_pengeluaran: {
                modal: modalBulanIni,
                pengeluaran: pengeluaranBulanIni,
                laba_bersih: labaBulanIni
            },
            
            // Produk Terlaris
            produk_terlaris: produkTerlarisResult.map(item => ({
                nama_barang: item.nama_barang,
                total_terjual: item.total_terjual || 0,
                total_omset: parseFloat(item.total_omset) || 0,
                total_laba: parseFloat(item.total_laba) || 0
            })),
            
            // Summary Data
            total_omset: omsetBulanIni,
            max_omset: trend7HariResult.length > 0 
                ? Math.max(...trend7HariResult.map(t => parseFloat(t.omset) || 0))
                : 0,
            min_omset: trend7HariResult.length > 0 
                ? Math.min(...trend7HariResult.map(t => parseFloat(t.omset) || 0))
                : 0,
            avg_omset: trend7HariResult.length > 0 
                ? Math.round(omsetBulanIni / trend7HariResult.length) 
                : 0,
            total_laba: labaBulanIni,
            max_laba: labaBulanIni * 0.4,
            min_laba: labaBulanIni * 0.1,
            avg_margin: parseFloat(marginBulanIni),
            total_transaksi: totalTransaksiBulan,
            transaksi_per_hari: totalTransaksiBulan > 0 
                ? parseFloat((totalTransaksiBulan / 30).toFixed(1))
                : 0,
            avg_transaksi: rataTransaksi,
            total_produk_terjual: totalProdukTerjual
        };
        
        // Render halaman
        res.render('admin/managementU', { 
            title: 'Laporan Keuangan',
            user: req.session.user,
            data: data,
            laporan: laporanResult || []
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

// Generate Laporan Harian (AJAX)
router.post('/keuangan/generate', keuanganController.generateLaporanHarian);

// Get Laporan dengan Pagination (AJAX)
router.get('/keuangan/laporan', keuanganController.getAllLaporan);

// Get Laporan by Range (AJAX)
router.get('/keuangan/laporan/range', keuanganController.getLaporanByRange);

// Get Laporan by ID (AJAX)
router.get('/keuangan/laporan/:id', keuanganController.getLaporanById);

// Update Laporan (AJAX)
router.put('/keuangan/laporan/:id', keuanganController.updateLaporan);

// Delete Laporan (AJAX)
router.delete('/keuangan/laporan/:id', keuanganController.deleteLaporan);

// Omset Routes (AJAX)
router.get('/keuangan/omset/harian', keuanganController.getOmsetHarian);
router.get('/keuangan/omset/bulanan', keuanganController.getOmsetBulanan);
router.get('/keuangan/omset/tahunan', keuanganController.getOmsetTahunan);
router.get('/keuangan/laba-rugi', keuanganController.getLabaRugi);

router.get('/keuangan/detail-omset', keuanganController.getDetailOmset);

// Dashboard Statistik (AJAX)
router.get('/keuangan/dashboard-statistik', keuanganController.getStatistikDashboard);

module.exports = router;