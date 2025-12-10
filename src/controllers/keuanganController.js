const pool = require('../config/database');

// ============ GENERATE LAPORAN HARIAN ============
exports.generateLaporanHarian = async (req, res) => {
    try {
        const { tanggal, total_pengeluaran } = req.body;
        
        if (!tanggal) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal harus diisi'
            });
        }
        
        // Cek apakah sudah ada laporan untuk tanggal ini
        const [existing] = await pool.execute(
            'SELECT id FROM laporan_keuangan WHERE tanggal = ?',
            [tanggal]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Laporan untuk tanggal ini sudah ada'
            });
        }
        
        // Hitung omset dari order_items
        const [omsetResult] = await pool.execute(
            `SELECT 
                COUNT(DISTINCT o.id) as total_penjualan,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as total_modal
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             JOIN products p ON oi.product_id = p.id
             WHERE DATE(o.created_at) = ?
             AND o.status = 'completed'`,
            [tanggal]
        );
        
        const totalPenjualan = omsetResult[0].total_penjualan || 0;
        const omset = parseFloat(omsetResult[0].omset) || 0;
        const totalModal = parseFloat(omsetResult[0].total_modal) || 0;
        const pengeluaran = parseFloat(total_pengeluaran) || 0;
        const laba = omset - totalModal - pengeluaran;
        
        // Insert laporan
        await pool.execute(
            `INSERT INTO laporan_keuangan 
             (tanggal, total_penjualan, omset, total_modal, total_pengeluaran, laba, keterangan)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                tanggal,
                totalPenjualan,
                omset,
                totalModal,
                pengeluaran,
                laba,
                `Laporan harian ${tanggal}`
            ]
        );
        
        res.json({
            success: true,
            message: 'Laporan berhasil digenerate',
            data: {
                tanggal,
                total_penjualan: totalPenjualan,
                omset,
                total_modal: totalModal,
                total_pengeluaran: pengeluaran,
                laba
            }
        });
        
    } catch (error) {
        console.error('Error generate laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal generate laporan'
        });
    }
};

// ============ GET ALL LAPORAN ============
exports.getAllLaporan = async (req, res) => {
    try {
        const [results] = await pool.execute(`
            SELECT 
                id, tanggal, total_penjualan,
                CAST(omset AS DECIMAL(15,2)) as omset,
                CAST(total_modal AS DECIMAL(15,2)) as total_modal,
                CAST(total_pengeluaran AS DECIMAL(15,2)) as total_pengeluaran,
                CAST(laba AS DECIMAL(15,2)) as laba,
                keterangan, created_at
            FROM laporan_keuangan 
            ORDER BY tanggal DESC 
            LIMIT 30
        `);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error get laporan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laporan'
        });
    }
};

// ============ GET LAPORAN BY RANGE ============
exports.getLaporanByRange = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        const [results] = await pool.execute(`
            SELECT * FROM laporan_keuangan 
            WHERE tanggal BETWEEN ? AND ?
            ORDER BY tanggal DESC
        `, [start_date, end_date]);
        
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laporan'
        });
    }
};

// ============ GET LAPORAN BY ID ============
exports.getLaporanById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [results] = await pool.execute(
            'SELECT * FROM laporan_keuangan WHERE id = ?',
            [id]
        );
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Laporan tidak ditemukan'
            });
        }
        
        res.json({
            success: true,
            data: results[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laporan'
        });
    }
};

// ============ UPDATE LAPORAN ============
exports.updateLaporan = async (req, res) => {
    try {
        const { id } = req.params;
        const { total_pengeluaran } = req.body;
        
        // Get existing data
        const [existing] = await pool.execute(
            'SELECT omset, total_modal FROM laporan_keuangan WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Laporan tidak ditemukan'
            });
        }
        
        const omset = parseFloat(existing[0].omset);
        const totalModal = parseFloat(existing[0].total_modal);
        const pengeluaran = parseFloat(total_pengeluaran) || 0;
        const laba = omset - totalModal - pengeluaran;
        
        await pool.execute(
            `UPDATE laporan_keuangan 
             SET total_pengeluaran = ?, laba = ?
             WHERE id = ?`,
            [pengeluaran, laba, id]
        );
        
        res.json({
            success: true,
            message: 'Laporan berhasil diupdate'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal update laporan'
        });
    }
};

// ============ DELETE LAPORAN ============
exports.deleteLaporan = async (req, res) => {
    try {
        const { id } = req.params;
        
        await pool.execute('DELETE FROM laporan_keuangan WHERE id = ?', [id]);
        
        res.json({
            success: true,
            message: 'Laporan berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal menghapus laporan'
        });
    }
};

// ============ GET OMSET HARIAN ============
exports.getOmsetHarian = async (req, res) => {
    try {
        const { tanggal } = req.query;
        const date = tanggal || new Date().toISOString().split('T')[0];
        
        const [results] = await pool.execute(`
            SELECT 
                DATE(o.created_at) as tanggal,
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) = ?
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at)
        `, [date]);
        
        // Get pengeluaran dari laporan_keuangan
        const [pengeluaran] = await pool.execute(
            'SELECT total_pengeluaran FROM laporan_keuangan WHERE tanggal = ?',
            [date]
        );
        
        const data = results.length > 0 ? results[0] : {
            tanggal: date,
            total_transaksi: 0,
            omset: 0,
            modal: 0,
            laba_kotor: 0
        };
        
        data.pengeluaran = pengeluaran.length > 0 ? parseFloat(pengeluaran[0].total_pengeluaran) : 0;
        data.laba_bersih = parseFloat(data.laba_kotor) - data.pengeluaran;
        
        res.json({
            success: true,
            data: data
        });
    } catch (error) {
        console.error('Error get omset harian:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data omset harian'
        });
    }
};

// ============ GET OMSET BULANAN ============
exports.getOmsetBulanan = async (req, res) => {
    try {
        const { bulan, tahun } = req.query;
        const month = bulan || new Date().getMonth() + 1;
        const year = tahun || new Date().getFullYear();
        
        // Data per hari dalam bulan
        const [dailyData] = await pool.execute(`
            SELECT 
                DATE(o.created_at) as tanggal,
                DAY(o.created_at) as hari,
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE MONTH(o.created_at) = ?
            AND YEAR(o.created_at) = ?
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at), DAY(o.created_at)
            ORDER BY tanggal
        `, [month, year]);
        
        // Total bulan
        const [totalBulan] = await pool.execute(`
            SELECT 
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as total_omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as total_modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as total_laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE MONTH(o.created_at) = ?
            AND YEAR(o.created_at) = ?
            AND o.status = 'completed'
        `, [month, year]);
        
        // Total pengeluaran bulan ini
        const [pengeluaranBulan] = await pool.execute(`
            SELECT COALESCE(SUM(total_pengeluaran), 0) as total_pengeluaran
            FROM laporan_keuangan
            WHERE MONTH(tanggal) = ? AND YEAR(tanggal) = ?
        `, [month, year]);
        
        const summary = totalBulan[0];
        summary.total_pengeluaran = parseFloat(pengeluaranBulan[0].total_pengeluaran) || 0;
        summary.total_laba_bersih = parseFloat(summary.total_laba_kotor) - summary.total_pengeluaran;
        
        res.json({
            success: true,
            data: {
                bulan: month,
                tahun: year,
                daily_data: dailyData,
                summary: summary
            }
        });
    } catch (error) {
        console.error('Error get omset bulanan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data omset bulanan'
        });
    }
};

// ============ GET OMSET TAHUNAN ============
exports.getOmsetTahunan = async (req, res) => {
    try {
        const { tahun } = req.query;
        const year = tahun || new Date().getFullYear();
        
        // Data per bulan
        const [monthlyData] = await pool.execute(`
            SELECT 
                MONTH(o.created_at) as bulan,
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE YEAR(o.created_at) = ?
            AND o.status = 'completed'
            GROUP BY MONTH(o.created_at)
            ORDER BY bulan
        `, [year]);
        
        // Total tahun
        const [totalTahun] = await pool.execute(`
            SELECT 
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as total_omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as total_modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as total_laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE YEAR(o.created_at) = ?
            AND o.status = 'completed'
        `, [year]);
        
        // Total pengeluaran tahun ini
        const [pengeluaranTahun] = await pool.execute(`
            SELECT COALESCE(SUM(total_pengeluaran), 0) as total_pengeluaran
            FROM laporan_keuangan
            WHERE YEAR(tanggal) = ?
        `, [year]);
        
        const summary = totalTahun[0];
        summary.total_pengeluaran = parseFloat(pengeluaranTahun[0].total_pengeluaran) || 0;
        summary.total_laba_bersih = parseFloat(summary.total_laba_kotor) - summary.total_pengeluaran;
        
        res.json({
            success: true,
            data: {
                tahun: year,
                monthly_data: monthlyData,
                summary: summary
            }
        });
    } catch (error) {
        console.error('Error get omset tahunan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data omset tahunan'
        });
    }
};

// ============ GET OMSET BY RANGE ============
exports.getOmsetByRange = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Parameter start_date dan end_date diperlukan'
            });
        }
        
        // Data per hari dalam range
        const [dailyData] = await pool.execute(`
            SELECT 
                DATE(o.created_at) as tanggal,
                DAY(o.created_at) as hari,
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at), DAY(o.created_at)
            ORDER BY tanggal
        `, [start_date, end_date]);
        
        // Total range
        const [totalRange] = await pool.execute(`
            SELECT 
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as total_omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as total_modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as total_laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
        `, [start_date, end_date]);
        
        // Total pengeluaran dalam range
        const [pengeluaranRange] = await pool.execute(`
            SELECT COALESCE(SUM(total_pengeluaran), 0) as total_pengeluaran
            FROM laporan_keuangan
            WHERE tanggal BETWEEN ? AND ?
        `, [start_date, end_date]);
        
        const summary = totalRange[0];
        summary.total_pengeluaran = parseFloat(pengeluaranRange[0].total_pengeluaran) || 0;
        summary.total_laba_bersih = parseFloat(summary.total_laba_kotor) - summary.total_pengeluaran;
        
        res.json({
            success: true,
            data: {
                start_date,
                end_date,
                daily_data: dailyData,
                summary: summary
            }
        });
    } catch (error) {
        console.error('Error get omset by range:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data omset range'
        });
    }
};

// ============ GET LABA RUGI ============
exports.getLabaRugi = async (req, res) => {
    try {
        console.log('🔥 Laba Rugi Endpoint Called!');
        console.log('Query Params:', req.query);
        
        const { periode, tanggal, bulan, tahun } = req.query;
        
        if (!periode) {
            return res.status(400).json({
                success: false,
                message: 'Parameter periode diperlukan (harian/bulanan/tahunan)'
            });
        }
        
        let query, params;
        
        if (periode === 'harian') {
            const date = tanggal || new Date().toISOString().split('T')[0];
            console.log('📅 Periode Harian:', date);
            
            query = `
                SELECT 
                    DATE(o.created_at) as periode,
                    COUNT(DISTINCT o.id) as total_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as pendapatan,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as hpp,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE DATE(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY DATE(o.created_at)
            `;
            params = [date];
        } else if (periode === 'bulanan') {
            const month = bulan || new Date().getMonth() + 1;
            const year = tahun || new Date().getFullYear();
            console.log('📅 Periode Bulanan:', month, year);
            
            query = `
                SELECT 
                    MONTH(o.created_at) as bulan,
                    COUNT(DISTINCT o.id) as total_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as pendapatan,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as hpp,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE MONTH(o.created_at) = ?
                AND YEAR(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY MONTH(o.created_at)
            `;
            params = [month, year];
        } else if (periode === 'tahunan') {
            const year = tahun || new Date().getFullYear();
            console.log('📅 Periode Tahunan:', year);
            
            query = `
                SELECT 
                    YEAR(o.created_at) as tahun,
                    COUNT(DISTINCT o.id) as total_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as pendapatan,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as hpp,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE YEAR(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY YEAR(o.created_at)
            `;
            params = [year];
        } else {
            return res.status(400).json({
                success: false,
                message: 'Periode tidak valid. Gunakan: harian, bulanan, atau tahunan'
            });
        }
        
        console.log('📝 SQL Query:', query);
        console.log('🔢 Query Params:', params);
        
        const [results] = await pool.execute(query, params);
        
        console.log('✅ Query Results:', results);
        
        // Jika tidak ada hasil dari transaksi, return data kosong
        if (results.length === 0) {
            let periodeLabel = '';
            if (periode === 'harian') periodeLabel = tanggal || new Date().toISOString().split('T')[0];
            else if (periode === 'bulanan') periodeLabel = `${tahun || new Date().getFullYear()}-${bulan || new Date().getMonth() + 1}`;
            else periodeLabel = tahun || new Date().getFullYear();
            
            return res.json({
                success: true,
                data: {
                    periode: periodeLabel,
                    total_transaksi: 0,
                    pendapatan: 0,
                    hpp: 0,
                    laba_kotor: 0,
                    laba_bersih: 0,
                    margin_laba: 0
                }
            });
        }
        
        const data = results[0];
        
        // Laba bersih = laba kotor (tanpa pengeluaran)
        data.laba_bersih = parseFloat(data.laba_kotor) || 0;
        
        // Hitung margin laba (dalam persen)
        const pendapatan = parseFloat(data.pendapatan) || 0;
        const labaBersih = parseFloat(data.laba_bersih) || 0;
        
        if (pendapatan > 0) {
            data.margin_laba = ((labaBersih / pendapatan) * 100).toFixed(2);
        } else {
            data.margin_laba = 0;
        }
        
        // Format data
        data.pendapatan = pendapatan;
        data.hpp = parseFloat(data.hpp) || 0;
        data.laba_kotor = parseFloat(data.laba_kotor) || 0;
        data.laba_bersih = labaBersih;
        
        console.log('📈 Final Data:', data);
        
        res.json({
            success: true,
            data: data
        });
        
    } catch (error) {
        console.error('❌ Error get laba rugi:', error);
        console.error('❌ Error Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laba rugi',
            error: error.message
        });
    }
};
// ============ GET DETAIL OMSET (UNTUK TABEL) ============
exports.getDetailOmset = async (req, res) => {
    try {
        const { periode = 'hari-ini', tanggal, bulan, tahun } = req.query;
        
        let query = '';
        let params = [];
        let groupBy = '';
        let dateCondition = '';
        
        // Tentukan periode berdasarkan parameter
        if (tanggal) {
            // Periode tanggal spesifik
            query = `
                SELECT 
                    DATE(o.created_at) as periode,
                    DATE_FORMAT(o.created_at, '%d %b %Y') as periode_formatted,
                    COUNT(DISTINCT o.id) as jumlah_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE DATE(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY DATE(o.created_at)
                ORDER BY o.created_at DESC
            `;
            params = [tanggal];
            groupBy = 'DATE(o.created_at)';
            
        } else if (periode === 'hari-ini') {
            // Hari ini
            const today = new Date().toISOString().split('T')[0];
            query = `
                SELECT 
                    DATE_FORMAT(o.created_at, '%d %b %Y %H:%i') as periode,
                    CONCAT('TRX-', LPAD(o.id, 6, '0')) as transaksi_kode,
                    COUNT(DISTINCT oi.id) as jumlah_item,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor,
                    o.id as order_id
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE DATE(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY o.id, DATE(o.created_at)
                ORDER BY o.created_at DESC
            `;
            params = [today];
            
        } else if (periode === 'bulan-ini') {
            // Bulan ini
            const currentMonth = new Date().getMonth() + 1;
            const currentYear = new Date().getFullYear();
            query = `
                SELECT 
                    DATE(o.created_at) as periode,
                    DATE_FORMAT(o.created_at, '%d %b %Y') as periode_formatted,
                    COUNT(DISTINCT o.id) as jumlah_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE MONTH(o.created_at) = ? 
                AND YEAR(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY DATE(o.created_at)
                ORDER BY periode DESC
            `;
            params = [currentMonth, currentYear];
            
        } else if (bulan && tahun) {
            // Bulan dan tahun spesifik
            query = `
                SELECT 
                    DATE(o.created_at) as periode,
                    DATE_FORMAT(o.created_at, '%d %b %Y') as periode_formatted,
                    COUNT(DISTINCT o.id) as jumlah_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE MONTH(o.created_at) = ? 
                AND YEAR(o.created_at) = ?
                AND o.status = 'completed'
                GROUP BY DATE(o.created_at)
                ORDER BY periode DESC
            `;
            params = [bulan, tahun];
            
        } else {
            // Default: 7 hari terakhir
            query = `
                SELECT 
                    DATE(o.created_at) as periode,
                    DATE_FORMAT(o.created_at, '%d %b %Y') as periode_formatted,
                    COUNT(DISTINCT o.id) as jumlah_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                AND o.status = 'completed'
                GROUP BY DATE(o.created_at)
                ORDER BY periode DESC
            `;
        }
        
        console.log('🔍 Query Detail Omset:', query);
        console.log('🔍 Query Params:', params);
        
        const [results] = await pool.execute(query, params);
        
        // Format data untuk tabel
        const formattedData = results.map(item => ({
            periode: item.periode_formatted || item.periode,
            transaksi: item.jumlah_transaksi || item.transaksi_kode || '-',
            omset: parseFloat(item.omset || 0),
            modal: parseFloat(item.modal || 0),
            laba_kotor: parseFloat(item.laba_kotor || 0),
            order_id: item.order_id || null
        }));
        
        res.json({
            success: true,
            data: formattedData,
            total: formattedData.length,
            periode: periode,
            tanggal: tanggal || 'hari ini'
        });
        
    } catch (error) {
        console.error('❌ Error get detail omset:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data detail omset',
            error: error.message
        });
    }
};
// ============ GET LABA RUGI BY RANGE ============
exports.getLabaRugiByRange = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        
        if (!start_date || !end_date) {
            return res.status(400).json({
                success: false,
                message: 'Parameter start_date dan end_date diperlukan'
            });
        }
        
        // Query untuk laba rugi dalam range
        const [results] = await pool.execute(`
            SELECT 
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as pendapatan,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as hpp,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
        `, [start_date, end_date]);
        
        // Total pengeluaran dalam range
        const [pengeluaran] = await pool.execute(`
            SELECT COALESCE(SUM(total_pengeluaran), 0) as total_pengeluaran
            FROM laporan_keuangan
            WHERE tanggal BETWEEN ? AND ?
        `, [start_date, end_date]);
        
        const data = results.length > 0 ? results[0] : {
            total_transaksi: 0,
            pendapatan: 0,
            hpp: 0,
            laba_kotor: 0
        };
        
        const totalPengeluaran = parseFloat(pengeluaran[0]?.total_pengeluaran) || 0;
        const labaBersih = parseFloat(data.laba_kotor) - totalPengeluaran;
        
        // Hitung margin laba
        const pendapatan = parseFloat(data.pendapatan) || 0;
        let marginLaba = 0;
        if (pendapatan > 0) {
            marginLaba = (labaBersih / pendapatan) * 100;
        }
        
        res.json({
            success: true,
            data: {
                start_date,
                end_date,
                total_transaksi: data.total_transaksi,
                pendapatan: data.pendapatan,
                hpp: data.hpp,
                laba_kotor: data.laba_kotor,
                beban_operasional: totalPengeluaran,
                laba_bersih: labaBersih,
                margin_laba: marginLaba.toFixed(2)
            }
        });
    } catch (error) {
        console.error('Error get laba rugi by range:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laba rugi range'
        });
    }
};

// ============ GET STATISTIK DASHBOARD ============
exports.getStatistikDashboard = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        
        const [stats] = await pool.execute(`
            SELECT 
                (SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
                 FROM orders o
                 JOIN order_items oi ON o.id = oi.order_id
                 WHERE DATE(o.created_at) = ? AND o.status = 'completed') as omset_hari_ini,
                
                (SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
                 FROM orders o
                 JOIN order_items oi ON o.id = oi.order_id
                 WHERE MONTH(o.created_at) = ? AND YEAR(o.created_at) = ? AND o.status = 'completed') as omset_bulan_ini,
                
                (SELECT COUNT(DISTINCT o.id)
                 FROM orders o
                 WHERE MONTH(o.created_at) = ? AND YEAR(o.created_at) = ? AND o.status = 'completed') as transaksi_bulan_ini
        `, [today, currentMonth, currentYear, currentMonth, currentYear]);
        
        res.json({
            success: true,
            data: stats[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil statistik'
        });
    }
};