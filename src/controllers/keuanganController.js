const pool = require('../config/database');

// ==================== CRUD LAPORAN KEUANGAN ====================

// CREATE - Generate Laporan Harian
const generateLaporanHarian = async (req, res) => {
    try {
        const { tanggal, total_pengeluaran } = req.body;
        
        if (!tanggal) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal wajib diisi'
            });
        }

        // Cek apakah laporan sudah ada
        const cekQuery = 'SELECT id FROM laporan_keuangan WHERE tanggal = ?';
        const [existing] = await pool.execute(cekQuery, [tanggal]);
        
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Laporan untuk tanggal ini sudah ada'
            });
        }

        // Hitung total penjualan dari orders
        const ordersQuery = `
            SELECT 
                COUNT(*) as total_penjualan
            FROM orders o
            WHERE DATE(o.created_at) = ? 
            AND o.status = 'completed'
        `;

        // FIXED: Hitung OMSET dari order_items (price × quantity)
        const omsetQuery = `
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
        `;

        // Hitung total modal dari products.price × quantity
        const modalQuery = `
            SELECT 
                COALESCE(SUM(p.price * oi.quantity), 0) as total_modal
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
        `;

        const [ordersData] = await pool.execute(ordersQuery, [tanggal]);
        const [omsetData] = await pool.execute(omsetQuery, [tanggal]);
        const [modalData] = await pool.execute(modalQuery, [tanggal]);

        const omset = parseFloat(omsetData[0].omset) || 0;
        const totalModal = parseFloat(modalData[0].total_modal) || 0;
        const pengeluaran = parseFloat(total_pengeluaran) || 0;
        const laba = omset - totalModal - pengeluaran;

        // Simpan laporan keuangan
        const insertQuery = `
            INSERT INTO laporan_keuangan 
            (tanggal, total_penjualan, omset, total_modal, total_pengeluaran, laba, keterangan) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const keterangan = `Laporan harian ${tanggal}`;
        
        const [result] = await pool.execute(insertQuery, [
            tanggal,
            ordersData[0].total_penjualan || 0,
            omset,
            totalModal,
            pengeluaran,
            laba,
            keterangan
        ]);

        res.json({
            success: true,
            message: 'Laporan harian berhasil digenerate',
            data: {
                id: result.insertId,
                tanggal,
                total_penjualan: ordersData[0].total_penjualan || 0,
                omset,
                total_modal: totalModal,
                total_pengeluaran: pengeluaran,
                laba,
                margin: omset > 0 ? ((laba / omset) * 100).toFixed(2) : 0
            }
        });

    } catch (error) {
        console.error('Error generate laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// READ - Get All Laporan dengan Pagination
const getAllLaporan = async (req, res) => {
    try {
        const { page = 1, limit = 10, sortBy = 'tanggal', sortOrder = 'DESC' } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                id, 
                tanggal, 
                total_penjualan, 
                omset, 
                total_modal,
                total_pengeluaran, 
                laba, 
                keterangan,
                created_at,
                CASE 
                    WHEN omset > 0 THEN ROUND((laba / omset) * 100, 2)
                    ELSE 0
                END as margin_percent
            FROM laporan_keuangan 
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?
        `;

        const countQuery = 'SELECT COUNT(*) as total FROM laporan_keuangan';

        const [laporan] = await pool.execute(query, [parseInt(limit), offset]);
        const [countResult] = await pool.execute(countQuery);
        const total = countResult[0].total;

        // Hitung summary
        const summaryQuery = `
            SELECT 
                SUM(total_penjualan) as total_transaksi,
                SUM(omset) as total_omset,
                SUM(total_modal) as total_modal_all,
                SUM(total_pengeluaran) as total_pengeluaran_all,
                SUM(laba) as total_laba,
                CASE 
                    WHEN SUM(omset) > 0 THEN AVG((laba / omset) * 100)
                    ELSE 0
                END as avg_margin
            FROM laporan_keuangan
        `;

        const [summary] = await pool.execute(summaryQuery);

        res.json({
            success: true,
            data: laporan,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            summary: summary[0]
        });

    } catch (error) {
        console.error('Error get all laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// READ - Get Laporan by Range
const getLaporanByRange = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date dan end date wajib diisi'
            });
        }

        // Query laporan dari tabel laporan_keuangan
        const laporanQuery = `
            SELECT 
                tanggal,
                total_penjualan,
                omset,
                total_modal,
                total_pengeluaran,
                laba,
                CASE 
                    WHEN omset > 0 THEN ROUND((laba / omset) * 100, 2)
                    ELSE 0
                END as margin_percent
            FROM laporan_keuangan
            WHERE tanggal BETWEEN ? AND ?
            ORDER BY tanggal
        `;

        // Query untuk data orders detail
        const ordersQuery = `
            SELECT 
                DATE(o.created_at) as tanggal,
                COUNT(*) as jumlah_transaksi,
                SUM(oi.price * oi.quantity) as omset,
                AVG(oi.price * oi.quantity) as rata_transaksi
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at)
            ORDER BY DATE(o.created_at)
        `;

        const [laporanData] = await pool.execute(laporanQuery, [start_date, end_date]);
        const [ordersData] = await pool.execute(ordersQuery, [start_date, end_date]);

        // Hitung total summary
        const totalSummary = {
            total_penjualan: laporanData.reduce((sum, item) => sum + item.total_penjualan, 0),
            total_omset: laporanData.reduce((sum, item) => sum + parseFloat(item.omset), 0),
            total_modal: laporanData.reduce((sum, item) => sum + parseFloat(item.total_modal), 0),
            total_pengeluaran: laporanData.reduce((sum, item) => sum + parseFloat(item.total_pengeluaran || 0), 0),
            total_laba: laporanData.reduce((sum, item) => sum + parseFloat(item.laba), 0)
        };

        res.json({
            success: true,
            data: {
                laporan_harian: laporanData,
                detail_orders: ordersData,
                summary: totalSummary
            },
            periode: {
                start_date,
                end_date,
                jumlah_hari: laporanData.length
            }
        });

    } catch (error) {
        console.error('Error get laporan by range:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// READ - Get Laporan by ID
const getLaporanById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                lk.*,
                CASE 
                    WHEN omset > 0 THEN ROUND((laba / omset) * 100, 2)
                    ELSE 0
                END as margin_percent
            FROM laporan_keuangan lk
            WHERE lk.id = ?
        `;

        const [laporan] = await pool.execute(query, [id]);

        if (laporan.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Laporan tidak ditemukan'
            });
        }

        // Get detail orders pada tanggal tersebut
        const ordersDetailQuery = `
            SELECT 
                o.*,
                (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as jumlah_item
            FROM orders o
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
            ORDER BY o.created_at DESC
        `;

        const [ordersDetail] = await pool.execute(ordersDetailQuery, [laporan[0].tanggal]);

        res.json({
            success: true,
            data: {
                laporan: laporan[0],
                orders_detail: ordersDetail
            }
        });

    } catch (error) {
        console.error('Error get laporan by id:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// UPDATE - Update Laporan
const updateLaporan = async (req, res) => {
    try {
        const { id } = req.params;
        const { keterangan, total_pengeluaran } = req.body;

        const checkQuery = 'SELECT * FROM laporan_keuangan WHERE id = ?';
        const [existing] = await pool.execute(checkQuery, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Laporan tidak ditemukan'
            });
        }

        // Hitung ulang laba jika pengeluaran diubah
        const pengeluaran = parseFloat(total_pengeluaran) || parseFloat(existing[0].total_pengeluaran) || 0;
        const omset = parseFloat(existing[0].omset);
        const totalModal = parseFloat(existing[0].total_modal);
        const laba = omset - totalModal - pengeluaran;

        const updateQuery = `
            UPDATE laporan_keuangan 
            SET keterangan = ?, total_pengeluaran = ?, laba = ?
            WHERE id = ?
        `;
        await pool.execute(updateQuery, [keterangan, pengeluaran, laba, id]);

        res.json({
            success: true,
            message: 'Laporan berhasil diperbarui'
        });

    } catch (error) {
        console.error('Error update laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// DELETE - Delete Laporan
const deleteLaporan = async (req, res) => {
    try {
        const { id } = req.params;

        const checkQuery = 'SELECT id FROM laporan_keuangan WHERE id = ?';
        const [existing] = await pool.execute(checkQuery, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Laporan tidak ditemukan'
            });
        }

        const deleteQuery = 'DELETE FROM laporan_keuangan WHERE id = ?';
        await pool.execute(deleteQuery, [id]);

        res.json({
            success: true,
            message: 'Laporan berhasil dihapus'
        });

    } catch (error) {
        console.error('Error delete laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// ==================== LAPORAN OMSET ====================

// GET Omset Harian
const getOmsetHarian = async (req, res) => {
    try {
        const { tanggal } = req.query;

        if (!tanggal) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal wajib diisi'
            });
        }

        const query = `
            SELECT 
                DATE(o.created_at) as tanggal,
                COUNT(DISTINCT o.id) as jumlah_transaksi,
                SUM(oi.price * oi.quantity) as total_omset,
                AVG(oi.price * oi.quantity) as rata_rata_transaksi
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at)
        `;

        const [results] = await pool.execute(query, [tanggal]);

        res.json({
            success: true,
            data: results[0] || {
                tanggal,
                jumlah_transaksi: 0,
                total_omset: 0,
                rata_rata_transaksi: 0
            }
        });

    } catch (error) {
        console.error('Error get omset harian:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// GET Omset Bulanan
const getOmsetBulanan = async (req, res) => {
    try {
        const { bulan, tahun } = req.query;

        if (!bulan || !tahun) {
            return res.status(400).json({
                success: false,
                message: 'Bulan dan tahun wajib diisi'
            });
        }

        const query = `
            SELECT 
                DATE_FORMAT(o.created_at, '%Y-%m') as periode,
                COUNT(DISTINCT o.id) as jumlah_transaksi,
                SUM(oi.price * oi.quantity) as total_omset,
                AVG(oi.price * oi.quantity) as rata_rata_transaksi,
                DAY(LAST_DAY(o.created_at)) as jumlah_hari
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE MONTH(o.created_at) = ? 
            AND YEAR(o.created_at) = ?
            AND o.status = 'completed'
            GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
        `;

        const [results] = await pool.execute(query, [bulan, tahun]);

        const data = results[0] || {
            periode: `${tahun}-${bulan.padStart(2, '0')}`,
            jumlah_transaksi: 0,
            total_omset: 0,
            rata_rata_transaksi: 0,
            jumlah_hari: new Date(tahun, bulan, 0).getDate()
        };

        data.omset_per_hari = data.total_omset / data.jumlah_hari || 0;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Error get omset bulanan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// GET Omset Tahunan
const getOmsetTahunan = async (req, res) => {
    try {
        const { tahun } = req.query;

        if (!tahun) {
            return res.status(400).json({
                success: false,
                message: 'Tahun wajib diisi'
            });
        }

        const query = `
            SELECT 
                YEAR(o.created_at) as tahun,
                MONTH(o.created_at) as bulan,
                DATE_FORMAT(o.created_at, '%Y-%m') as periode,
                COUNT(DISTINCT o.id) as jumlah_transaksi,
                SUM(oi.price * oi.quantity) as total_omset
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE YEAR(o.created_at) = ?
            AND o.status = 'completed'
            GROUP BY YEAR(o.created_at), MONTH(o.created_at)
            ORDER BY MONTH(o.created_at)
        `;

        const [results] = await pool.execute(query, [tahun]);

        const totalTahunan = {
            total_omset: results.reduce((sum, item) => sum + parseFloat(item.total_omset), 0),
            total_transaksi: results.reduce((sum, item) => sum + item.jumlah_transaksi, 0)
        };

        res.json({
            success: true,
            data: {
                detail_bulanan: results,
                total_tahunan: totalTahunan
            }
        });

    } catch (error) {
        console.error('Error get omset tahunan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// ==================== LAPORAN LABA RUGI ====================

// GET Laba Rugi
const getLabaRugi = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Start date dan end date wajib diisi'
            });
        }

        // Total Pendapatan (Omset) dari order_items
        const pendapatanQuery = `
            SELECT 
                SUM(oi.price * oi.quantity) as total_pendapatan
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status = 'completed'
        `;

        // Hitung HPP (Harga Pokok Penjualan) dari products.price
        const hppQuery = `
            SELECT 
                SUM(p.price * oi.quantity) as hpp
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            WHERE o.created_at BETWEEN ? AND ?
            AND o.status = 'completed'
        `;

        // Total pengeluaran operasional
        const pengeluaranQuery = `
            SELECT 
                SUM(total_pengeluaran) as total_pengeluaran
            FROM laporan_keuangan
            WHERE tanggal BETWEEN ? AND ?
        `;

        const [pendapatan] = await pool.execute(pendapatanQuery, [start_date + ' 00:00:00', end_date + ' 23:59:59']);
        const [hppData] = await pool.execute(hppQuery, [start_date + ' 00:00:00', end_date + ' 23:59:59']);
        const [pengeluaranData] = await pool.execute(pengeluaranQuery, [start_date, end_date]);

        const totalPendapatan = parseFloat(pendapatan[0]?.total_pendapatan) || 0;
        const hpp = parseFloat(hppData[0]?.hpp) || 0;
        const totalPengeluaran = parseFloat(pengeluaranData[0]?.total_pengeluaran) || 0;
        const labaKotor = totalPendapatan - hpp;
        const labaBersih = labaKotor - totalPengeluaran;

        res.json({
            success: true,
            data: {
                periode: { start_date, end_date },
                pendapatan: {
                    total_pendapatan: totalPendapatan,
                    hpp: hpp,
                    laba_kotor: labaKotor,
                    margin_kotor: totalPendapatan > 0 ? (labaKotor / totalPendapatan) * 100 : 0
                },
                pengeluaran: {
                    total_pengeluaran: totalPengeluaran
                },
                summary: {
                    total_pendapatan: totalPendapatan,
                    total_pengeluaran: hpp + totalPengeluaran,
                    laba_bersih: labaBersih
                }
            }
        });

    } catch (error) {
        console.error('Error get laba rugi:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// ==================== DASHBOARD & STATISTIK ====================

// GET Statistik Dashboard
const getStatistikDashboard = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        // Omset Hari Ini
        const omsetHariIniQuery = `
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset_hari_ini,
                COUNT(DISTINCT o.id) as transaksi_hari_ini
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
        `;

        // Omset Bulan Ini
        const omsetBulanIniQuery = `
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset_bulan_ini,
                COUNT(DISTINCT o.id) as transaksi_bulan_ini
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE MONTH(o.created_at) = ? 
            AND YEAR(o.created_at) = ?
            AND o.status = 'completed'
        `;

        // Trend 7 Hari Terakhir
        const trendQuery = `
            SELECT 
                DATE(o.created_at) as tanggal,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COUNT(DISTINCT o.id) as jumlah_transaksi
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at)
            ORDER BY tanggal
        `;

        // Produk Terlaris Bulan Ini
        const produkTerlarisQuery = `
            SELECT 
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
            LIMIT 5
        `;

        const [omsetHariIni] = await pool.execute(omsetHariIniQuery, [today]);
        const [omsetBulanIni] = await pool.execute(omsetBulanIniQuery, [currentMonth, currentYear]);
        const [trendData] = await pool.execute(trendQuery);
        const [produkTerlaris] = await pool.execute(produkTerlarisQuery, [currentMonth, currentYear]);

        res.json({
            success: true,
            data: {
                omset_hari_ini: omsetHariIni[0],
                omset_bulan_ini: omsetBulanIni[0],
                trend_7_hari: trendData,
                produk_terlaris: produkTerlaris
            }
        });

    } catch (error) {
        console.error('Error get statistik dashboard:', error);
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
};

// ==================== FUNGSI UTILITY ====================

// Generate Laporan Otomatis (untuk cron job)
const generateLaporanOtomatis = async () => {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const tanggal = yesterday.toISOString().split('T')[0];

        // Cek apakah sudah ada
        const cekQuery = 'SELECT id FROM laporan_keuangan WHERE tanggal = ?';
        const [existing] = await pool.execute(cekQuery, [tanggal]);

        if (existing.length > 0) {
            console.log(`Laporan untuk ${tanggal} sudah ada`);
            return;
        }

        // Hitung total penjualan
        const ordersQuery = `
            SELECT 
                COUNT(*) as total_penjualan
            FROM orders
            WHERE DATE(created_at) = ? 
            AND status = 'completed'
        `;

        // Hitung omset dari order_items
        const omsetQuery = `
            SELECT 
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
        `;

        // Hitung modal
        const modalQuery = `
            SELECT 
                COALESCE(SUM(p.price * oi.quantity), 0) as total_modal
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
        `;

        const [ordersData] = await pool.execute(ordersQuery, [tanggal]);
        const [omsetData] = await pool.execute(omsetQuery, [tanggal]);
        const [modalData] = await pool.execute(modalQuery, [tanggal]);

        const omset = parseFloat(omsetData[0].omset) || 0;
        const totalModal = parseFloat(modalData[0].total_modal) || 0;
        const pengeluaran = 0; // Default 0, bisa diupdate manual nanti
        const laba = omset - totalModal - pengeluaran;

        // Simpan laporan
        const insertQuery = `
            INSERT INTO laporan_keuangan 
            (tanggal, total_penjualan, omset, total_modal, total_pengeluaran, laba, keterangan) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const keterangan = `Laporan harian otomatis`;
        
        await pool.execute(insertQuery, [
            tanggal,
            ordersData[0].total_penjualan || 0,
            omset,
            totalModal,
            pengeluaran,
            laba,
            keterangan
        ]);

        console.log(`Laporan untuk ${tanggal} berhasil digenerate`);

    } catch (error) {
        console.error('Error generate laporan otomatis:', error);
    }
};

module.exports = {
    // CRUD Laporan Keuangan
    generateLaporanHarian,
    getAllLaporan,
    getLaporanByRange,
    getLaporanById,
    updateLaporan,
    deleteLaporan,
    
    // Omset
    getOmsetHarian,
    getOmsetBulanan,
    getOmsetTahunan,
    
    // Laba Rugi
    getLabaRugi,
    
    // Dashboard
    getStatistikDashboard,
    
    // Utility
    generateLaporanOtomatis
};