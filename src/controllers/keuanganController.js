const pool = require('../config/database');
// ==================== CRUD LAPORAN KEUANGAN ====================

// CREATE - Generate Laporan Harian (bisa dijadwalkan cron job)
const generateLaporanHarian = async (req, res) => {
    try {
        const { tanggal } = req.body;
        
        // Validasi tanggal
        if (!tanggal) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal wajib diisi'
            });
        }

        // Cek apakah laporan untuk tanggal tersebut sudah ada
        const cekQuery = 'SELECT id FROM laporan_keuangan WHERE tanggal = ?';
        const [existing] = await pool.execute(cekQuery, [tanggal]);
        
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Laporan untuk tanggal ini sudah ada'
            });
        }

        // Hitung total penjualan dan omset dari transaksi
        const transaksiQuery = `
            SELECT 
                COUNT(*) as total_penjualan,
                COALESCE(SUM(total_harga), 0) as omset,
                COALESCE(SUM(total_modal), 0) as total_modal,
                COALESCE(SUM(total_harga - total_modal), 0) as laba_kotor
            FROM transaksi 
            WHERE DATE(tanggal_transaksi) = ? 
            AND status = 'selesai'
        `;

        // Hitung pengeluaran operasional
        const pengeluaranQuery = `
            SELECT COALESCE(SUM(jumlah), 0) as total_pengeluaran
            FROM pengeluaran 
            WHERE tanggal = ?
        `;

        const [transaksiData] = await pool.execute(transaksiQuery, [tanggal]);
        const [pengeluaranData] = await pool.execute(pengeluaranQuery, [tanggal]);

        const omset = parseFloat(transaksiData[0].omset) || 0;
        const totalModal = parseFloat(transaksiData[0].total_modal) || 0;
        const labaKotor = parseFloat(transaksiData[0].laba_kotor) || 0;
        const pengeluaran = parseFloat(pengeluaranData[0].total_pengeluaran) || 0;
        const labaBersih = labaKotor - pengeluaran;

        // Simpan laporan keuangan
        const insertQuery = `
            INSERT INTO laporan_keuangan 
            (tanggal, total_penjualan, omset, total_modal, laba, keterangan) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const keterangan = `Laporan harian ${tanggal}. Pengeluaran operasional: Rp ${pengeluaran.toLocaleString()}`;
        
        const [result] = await pool.execute(insertQuery, [
            tanggal,
            transaksiData[0].total_penjualan || 0,
            omset,
            totalModal,
            labaBersih,
            keterangan
        ]);

        res.json({
            success: true,
            message: 'Laporan harian berhasil digenerate',
            data: {
                id: result.insertId,
                tanggal,
                total_penjualan: transaksiData[0].total_penjualan || 0,
                omset,
                total_modal: totalModal,
                laba: labaBersih,
                laba_kotor: labaKotor,
                pengeluaran: pengeluaran,
                margin: omset > 0 ? ((labaBersih / omset) * 100).toFixed(2) : 0
            }
        });

    } catch (error) {
        console.error('Error generate laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// READ - Get All Laporan dengan Pagination
const getAllLaporan = async (req, res) => {
    try {
        const { page = 1, limit = 10, sortBy = 'tanggal', sortOrder = 'DESC' } = req.query;
        const offset = (page - 1) * limit;

        // Query untuk data laporan
        const query = `
            SELECT 
                id, 
                tanggal, 
                total_penjualan, 
                omset, 
                total_modal, 
                laba, 
                keterangan,
                created_at,
                ROUND((laba / omset) * 100, 2) as margin_percent
            FROM laporan_keuangan 
            ORDER BY ${sortBy} ${sortOrder}
            LIMIT ? OFFSET ?
        `;

        // Query untuk total count
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
                SUM(laba) as total_laba,
                AVG((laba / omset) * 100) as avg_margin
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
            message: 'Server error'
        });
    }
};

// READ - Get Laporan by Tanggal (Range)
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
                SUM(total_penjualan) as total_penjualan,
                SUM(omset) as omset,
                SUM(total_modal) as total_modal,
                SUM(laba) as laba,
                ROUND((SUM(laba) / SUM(omset)) * 100, 2) as margin_percent
            FROM laporan_keuangan
            WHERE tanggal BETWEEN ? AND ?
            GROUP BY tanggal
            ORDER BY tanggal
        `;

        // Query untuk data transaksi detail (jika perlu)
        const transaksiQuery = `
            SELECT 
                DATE(tanggal_transaksi) as tanggal,
                COUNT(*) as jumlah_transaksi,
                SUM(total_harga) as omset,
                SUM(total_modal) as modal,
                SUM(total_harga - total_modal) as laba_kotor,
                AVG(total_harga) as rata_transaksi
            FROM transaksi
            WHERE DATE(tanggal_transaksi) BETWEEN ? AND ?
            AND status = 'selesai'
            GROUP BY DATE(tanggal_transaksi)
            ORDER BY DATE(tanggal_transaksi)
        `;

        // Query untuk pengeluaran
        const pengeluaranQuery = `
            SELECT 
                tanggal,
                SUM(jumlah) as total_pengeluaran
            FROM pengeluaran
            WHERE tanggal BETWEEN ? AND ?
            GROUP BY tanggal
            ORDER BY tanggal
        `;

        const [laporanData] = await pool.execute(laporanQuery, [start_date, end_date]);
        const [transaksiData] = await pool.execute(transaksiQuery, [start_date, end_date]);
        const [pengeluaranData] = await pool.execute(pengeluaranQuery, [start_date, end_date]);

        // Hitung total summary
        const totalSummary = {
            total_penjualan: laporanData.reduce((sum, item) => sum + item.total_penjualan, 0),
            total_omset: laporanData.reduce((sum, item) => sum + parseFloat(item.omset), 0),
            total_modal: laporanData.reduce((sum, item) => sum + parseFloat(item.total_modal), 0),
            total_laba: laporanData.reduce((sum, item) => sum + parseFloat(item.laba), 0),
            total_pengeluaran: pengeluaranData.reduce((sum, item) => sum + parseFloat(item.total_pengeluaran), 0)
        };

        res.json({
            success: true,
            data: {
                laporan_harian: laporanData,
                detail_transaksi: transaksiData,
                pengeluaran: pengeluaranData,
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
            message: 'Server error'
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
                ROUND((laba / omset) * 100, 2) as margin_percent,
                (SELECT COALESCE(SUM(jumlah), 0) FROM pengeluaran WHERE tanggal = lk.tanggal) as pengeluaran_operasional,
                (SELECT COUNT(*) FROM transaksi WHERE DATE(tanggal_transaksi) = lk.tanggal AND status = 'selesai') as jumlah_transaksi_detail
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

        // Get detail transaksi pada tanggal tersebut
        const transaksiDetailQuery = `
            SELECT 
                t.*,
                (SELECT COUNT(*) FROM detail_transaksi WHERE transaksi_id = t.id) as jumlah_item
            FROM transaksi t
            WHERE DATE(t.tanggal_transaksi) = ?
            AND t.status = 'selesai'
            ORDER BY t.tanggal_transaksi DESC
        `;

        // Get pengeluaran detail
        const pengeluaranDetailQuery = `
            SELECT * FROM pengeluaran 
            WHERE tanggal = ?
            ORDER BY created_at DESC
        `;

        const [transaksiDetail] = await pool.execute(transaksiDetailQuery, [laporan[0].tanggal]);
        const [pengeluaranDetail] = await pool.execute(pengeluaranDetailQuery, [laporan[0].tanggal]);

        res.json({
            success: true,
            data: {
                laporan: laporan[0],
                transaksi_detail: transaksiDetail,
                pengeluaran_detail: pengeluaranDetail
            }
        });

    } catch (error) {
        console.error('Error get laporan by id:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// UPDATE - Update Laporan
const updateLaporan = async (req, res) => {
    try {
        const { id } = req.params;
        const { keterangan } = req.body;

        // Cek apakah laporan ada
        const checkQuery = 'SELECT id FROM laporan_keuangan WHERE id = ?';
        const [existing] = await pool.execute(checkQuery, [id]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Laporan tidak ditemukan'
            });
        }

        // Update hanya keterangan, field lain sebaiknya tidak diupdate manual
        const updateQuery = 'UPDATE laporan_keuangan SET keterangan = ? WHERE id = ?';
        await pool.execute(updateQuery, [keterangan, id]);

        res.json({
            success: true,
            message: 'Laporan berhasil diperbarui'
        });

    } catch (error) {
        console.error('Error update laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// DELETE - Delete Laporan
const deleteLaporan = async (req, res) => {
    try {
        const { id } = req.params;

        // Cek apakah laporan ada
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
            message: 'Server error'
        });
    }
};

// ==================== LAPORAN OMSEt ====================

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
                DATE(tanggal_transaksi) as tanggal,
                COUNT(*) as jumlah_transaksi,
                SUM(total_harga) as total_omset,
                SUM(total_modal) as total_modal,
                SUM(total_harga - total_modal) as laba_kotor,
                AVG(total_harga) as rata_rata_transaksi
            FROM transaksi
            WHERE DATE(tanggal_transaksi) = ?
            AND status = 'selesai'
            GROUP BY DATE(tanggal_transaksi)
        `;

        const [results] = await pool.execute(query, [tanggal]);

        res.json({
            success: true,
            data: results[0] || {
                tanggal,
                jumlah_transaksi: 0,
                total_omset: 0,
                total_modal: 0,
                laba_kotor: 0,
                rata_rata_transaksi: 0
            }
        });

    } catch (error) {
        console.error('Error get omset harian:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
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
                DATE_FORMAT(tanggal_transaksi, '%Y-%m') as periode,
                COUNT(*) as jumlah_transaksi,
                SUM(total_harga) as total_omset,
                SUM(total_modal) as total_modal,
                SUM(total_harga - total_modal) as laba_kotor,
                AVG(total_harga) as rata_rata_transaksi,
                DAY(LAST_DAY(tanggal_transaksi)) as jumlah_hari
            FROM transaksi
            WHERE MONTH(tanggal_transaksi) = ? 
            AND YEAR(tanggal_transaksi) = ?
            AND status = 'selesai'
            GROUP BY DATE_FORMAT(tanggal_transaksi, '%Y-%m')
        `;

        const [results] = await pool.execute(query, [bulan, tahun]);

        // Hitung omset per hari rata-rata
        const data = results[0] || {
            periode: `${tahun}-${bulan.padStart(2, '0')}`,
            jumlah_transaksi: 0,
            total_omset: 0,
            total_modal: 0,
            laba_kotor: 0,
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
            message: 'Server error'
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
                YEAR(tanggal_transaksi) as tahun,
                MONTH(tanggal_transaksi) as bulan,
                DATE_FORMAT(tanggal_transaksi, '%Y-%m') as periode,
                COUNT(*) as jumlah_transaksi,
                SUM(total_harga) as total_omset,
                SUM(total_modal) as total_modal,
                SUM(total_harga - total_modal) as laba_kotor
            FROM transaksi
            WHERE YEAR(tanggal_transaksi) = ?
            AND status = 'selesai'
            GROUP BY YEAR(tanggal_transaksi), MONTH(tanggal_transaksi)
            ORDER BY MONTH(tanggal_transaksi)
        `;

        const [results] = await pool.execute(query, [tahun]);

        // Hitung total tahunan
        const totalTahunan = {
            total_omset: results.reduce((sum, item) => sum + parseFloat(item.total_omset), 0),
            total_transaksi: results.reduce((sum, item) => sum + item.jumlah_transaksi, 0),
            total_laba_kotor: results.reduce((sum, item) => sum + parseFloat(item.laba_kotor), 0)
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
            message: 'Server error'
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

        // Pendapatan (Omset)
        const pendapatanQuery = `
            SELECT 
                SUM(total_harga) as total_pendapatan,
                SUM(total_modal) as hpp,
                SUM(total_harga - total_modal) as laba_kotor
            FROM transaksi
            WHERE tanggal_transaksi BETWEEN ? AND ?
            AND status = 'selesai'
        `;

        // Pengeluaran Operasional
        const pengeluaranQuery = `
            SELECT 
                COALESCE(SUM(jumlah), 0) as total_pengeluaran
            FROM pengeluaran
            WHERE tanggal BETWEEN ? AND ?
        `;

        const [pendapatan] = await pool.execute(pendapatanQuery, [start_date + ' 00:00:00', end_date + ' 23:59:59']);
        const [pengeluaran] = await pool.execute(pengeluaranQuery, [start_date, end_date]);

        const totalPendapatan = parseFloat(pendapatan[0]?.total_pendapatan) || 0;
        const hpp = parseFloat(pendapatan[0]?.hpp) || 0;
        const labaKotor = parseFloat(pendapatan[0]?.laba_kotor) || 0;
        const totalPengeluaran = parseFloat(pengeluaran[0]?.total_pengeluaran) || 0;
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
                    total_pengeluaran: totalPengeluaran,
                    laba_bersih: labaBersih,
                    margin_bersih: totalPendapatan > 0 ? (labaBersih / totalPendapatan) * 100 : 0
                },
                summary: {
                    total_pendapatan: totalPendapatan,
                    total_pengeluaran: totalPengeluaran + hpp,
                    laba_bersih: labaBersih
                }
            }
        });

    } catch (error) {
        console.error('Error get laba rugi:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
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
                COALESCE(SUM(total_harga), 0) as omset_hari_ini,
                COALESCE(SUM(total_modal), 0) as modal_hari_ini,
                COALESCE(SUM(total_harga - total_modal), 0) as laba_hari_ini,
                COUNT(*) as transaksi_hari_ini
            FROM transaksi
            WHERE DATE(tanggal_transaksi) = ?
            AND status = 'selesai'
        `;

        // Omset Bulan Ini
        const omsetBulanIniQuery = `
            SELECT 
                COALESCE(SUM(total_harga), 0) as omset_bulan_ini,
                COALESCE(SUM(total_modal), 0) as modal_bulan_ini,
                COALESCE(SUM(total_harga - total_modal), 0) as laba_bulan_ini,
                COUNT(*) as transaksi_bulan_ini
            FROM transaksi
            WHERE MONTH(tanggal_transaksi) = ? 
            AND YEAR(tanggal_transaksi) = ?
            AND status = 'selesai'
        `;

        // Trend 7 Hari Terakhir
        const trendQuery = `
            SELECT 
                DATE(tanggal_transaksi) as tanggal,
                COALESCE(SUM(total_harga), 0) as omset,
                COUNT(*) as jumlah_transaksi
            FROM transaksi
            WHERE tanggal_transaksi >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            AND status = 'selesai'
            GROUP BY DATE(tanggal_transaksi)
            ORDER BY tanggal
        `;

        // Produk Terlaris Bulan Ini
        const produkTerlarisQuery = `
            SELECT 
                b.nama_barang,
                SUM(dt.jumlah) as total_terjual,
                SUM(dt.subtotal) as total_omset,
                SUM(dt.laba) as total_laba
            FROM detail_transaksi dt
            JOIN transaksi t ON dt.transaksi_id = t.id
            JOIN barang b ON dt.barang_id = b.id
            WHERE MONTH(t.tanggal_transaksi) = ? 
            AND YEAR(t.tanggal_transaksi) = ?
            AND t.status = 'selesai'
            GROUP BY b.id, b.nama_barang
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
            message: 'Server error'
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

        // Hitung data
        const transaksiQuery = `
            SELECT 
                COUNT(*) as total_penjualan,
                COALESCE(SUM(total_harga), 0) as omset,
                COALESCE(SUM(total_modal), 0) as total_modal,
                COALESCE(SUM(total_harga - total_modal), 0) as laba_kotor
            FROM transaksi 
            WHERE DATE(tanggal_transaksi) = ? 
            AND status = 'selesai'
        `;

        const pengeluaranQuery = `
            SELECT COALESCE(SUM(jumlah), 0) as total_pengeluaran
            FROM pengeluaran 
            WHERE tanggal = ?
        `;

        const [transaksiData] = await pool.execute(transaksiQuery, [tanggal]);
        const [pengeluaranData] = await pool.execute(pengeluaranQuery, [tanggal]);

        const omset = parseFloat(transaksiData[0].omset) || 0;
        const totalModal = parseFloat(transaksiData[0].total_modal) || 0;
        const labaKotor = parseFloat(transaksiData[0].laba_kotor) || 0;
        const pengeluaran = parseFloat(pengeluaranData[0].total_pengeluaran) || 0;
        const labaBersih = labaKotor - pengeluaran;

        // Simpan laporan
        const insertQuery = `
            INSERT INTO laporan_keuangan 
            (tanggal, total_penjualan, omset, total_modal, laba, keterangan) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const keterangan = `Laporan harian otomatis. Pengeluaran: Rp ${pengeluaran.toLocaleString()}`;
        
        await pool.execute(insertQuery, [
            tanggal,
            transaksiData[0].total_penjualan || 0,
            omset,
            totalModal,
            labaBersih,
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