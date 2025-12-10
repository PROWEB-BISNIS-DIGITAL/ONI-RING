const pool = require('../config/database');

// ============ GENERATE LAPORAN HARIAN ============
exports.generateLaporanHarian = async (req, res) => {
    try {
        res.status(400).json({
            success: false,
            message: 'Fitur laporan harian tidak digunakan lagi'
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
        res.json({
            success: true,
            data: [],
            message: 'Tabel laporan keuangan tidak digunakan lagi'
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
        res.json({
            success: true,
            data: []
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
        res.status(404).json({
            success: false,
            message: 'Laporan tidak ditemukan'
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
        
        const data = results.length > 0 ? results[0] : {
            tanggal: date,
            total_transaksi: 0,
            omset: 0,
            modal: 0,
            laba_kotor: 0
        };
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
        data.laba_bersih = parseFloat(data.laba_kotor) || 0;
        
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


// ============ GET OMSET MINGGUAN ============
exports.getOmsetMingguan = async (req, res) => {
    try {
        const { minggu_ke, tahun } = req.query;
        
        // Jika tidak ada parameter, gunakan minggu ini
        const currentWeek = minggu_ke || this.getWeekNumber(new Date());
        const currentYear = tahun || new Date().getFullYear();
        
        // Hitung tanggal awal dan akhir minggu
        const weekDates = this.getDateRangeOfWeek(currentWeek, currentYear);
        
        // Data per hari dalam minggu
        const [dailyData] = await pool.execute(`
            SELECT 
                DATE(o.created_at) as tanggal,
                DAY(o.created_at) as hari,
                DAYNAME(o.created_at) as nama_hari,
                COUNT(DISTINCT o.id) as total_transaksi,
                COALESCE(SUM(oi.price * oi.quantity), 0) as omset,
                COALESCE(SUM(p.harga_beli * oi.quantity), 0) as modal,
                COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
            FROM orders o
            JOIN order_items oi ON o.id = oi.order_id
            JOIN products p ON oi.product_id = p.id
            WHERE DATE(o.created_at) BETWEEN ? AND ?
            AND o.status = 'completed'
            GROUP BY DATE(o.created_at), DAY(o.created_at), DAYNAME(o.created_at)
            ORDER BY tanggal
        `, [weekDates.startDate, weekDates.endDate]);
        
        // Total minggu
        const [totalMinggu] = await pool.execute(`
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
        `, [weekDates.startDate, weekDates.endDate]);
        
        const summary = totalMinggu[0] || {
            total_transaksi: 0,
            total_omset: 0,
            total_modal: 0,
            total_laba_kotor: 0
        };
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
        summary.total_laba_bersih = parseFloat(summary.total_laba_kotor) || 0;
        
        res.json({
            success: true,
            data: {
                minggu_ke: currentWeek,
                tahun: currentYear,
                start_date: weekDates.startDate,
                end_date: weekDates.endDate,
                daily_data: dailyData,
                summary: summary
            }
        });
    } catch (error) {
        console.error('Error get omset mingguan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data omset mingguan'
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
        
        const summary = totalBulan[0] || {
            total_transaksi: 0,
            total_omset: 0,
            total_modal: 0,
            total_laba_kotor: 0
        };
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
        summary.total_laba_bersih = parseFloat(summary.total_laba_kotor) || 0;
        
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
        
        const summary = totalTahun[0] || {
            total_transaksi: 0,
            total_omset: 0,
            total_modal: 0,
            total_laba_kotor: 0
        };
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
        summary.total_laba_bersih = parseFloat(summary.total_laba_kotor) || 0;
        
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


// ============ GET LABA RUGI ============
exports.getLabaRugi = async (req, res) => {
    try {
        console.log('🔥 Laba Rugi Endpoint Called!');
        console.log('Query Params:', req.query);
        
        const { periode, tanggal, bulan, tahun, minggu_ke } = req.query;
        
        if (!periode) {
            return res.status(400).json({
                success: false,
                message: 'Parameter periode diperlukan (harian/mingguan/bulanan/tahunan)'
            });
        }
        
        let query, params;
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 
                          'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        
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
            
        } else if (periode === 'mingguan') {
            const week = minggu_ke || this.getWeekNumber(new Date());
            const year = tahun || new Date().getFullYear();
            console.log('📅 Periode Mingguan:', week, year);
            
            const weekDates = this.getDateRangeOfWeek(week, year);
            
            query = `
                SELECT 
                    'Minggu Ke-${week}' as periode,
                    COUNT(DISTINCT o.id) as total_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as pendapatan,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as hpp,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE DATE(o.created_at) BETWEEN ? AND ?
                AND o.status = 'completed'
            `;
            params = [weekDates.startDate, weekDates.endDate];
            
        } else if (periode === 'bulanan') {
            const month = bulan || new Date().getMonth() + 1;
            const year = tahun || new Date().getFullYear();
            console.log('📅 Periode Bulanan:', month, year);
            
            query = `
                SELECT 
                    ? as periode,
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
            `;
            params = [`Bulan ${monthNames[month-1]} ${year}`, month, year];
            
        } else if (periode === 'tahunan') {
            const year = tahun || new Date().getFullYear();
            console.log('📅 Periode Tahunan:', year);
            
            query = `
                SELECT 
                    ? as periode,
                    COUNT(DISTINCT o.id) as total_transaksi,
                    COALESCE(SUM(oi.price * oi.quantity), 0) as pendapatan,
                    COALESCE(SUM(p.harga_beli * oi.quantity), 0) as hpp,
                    COALESCE(SUM((oi.price - p.harga_beli) * oi.quantity), 0) as laba_kotor
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN products p ON oi.product_id = p.id
                WHERE YEAR(o.created_at) = ?
                AND o.status = 'completed'
            `;
            params = [`Tahun ${year}`, year];
            
        } else {
            return res.status(400).json({
                success: false,
                message: 'Periode tidak valid. Gunakan: harian, mingguan, bulanan, atau tahunan'
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
            else if (periode === 'mingguan') periodeLabel = `Minggu Ke-${minggu_ke || this.getWeekNumber(new Date())} ${tahun || new Date().getFullYear()}`;
            else if (periode === 'bulanan') periodeLabel = `Bulan ${monthNames[(bulan || new Date().getMonth() + 1) - 1]} ${tahun || new Date().getFullYear()}`;
            else periodeLabel = `Tahun ${tahun || new Date().getFullYear()}`;
            
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
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
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
        
        // Tambahkan info periode
        if (periode === 'mingguan' && minggu_ke && tahun) {
            data.minggu_ke = minggu_ke;
            data.tahun = tahun;
        }
        
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
            error: error.message,
            sql: error.sql || 'No SQL query'
        });
    }
};

// ============ GET DETAIL OMSET (UNTUK TABEL) ============
exports.getDetailOmset = async (req, res) => {
    try {
        const { periode = 'hari-ini', tanggal, minggu_ke, tahun } = req.query;
        
        let query = '';
        let params = [];
        
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
            
        } else if (periode === 'minggu-ini') {
            // Minggu ini
            const weekNumber = this.getWeekNumber(new Date());
            const year = new Date().getFullYear();
            const weekDates = this.getDateRangeOfWeek(weekNumber, year);
            
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
                WHERE DATE(o.created_at) BETWEEN ? AND ?
                AND o.status = 'completed'
                GROUP BY DATE(o.created_at)
                ORDER BY periode DESC
            `;
            params = [weekDates.startDate, weekDates.endDate];
            
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


// ============ GET LABA RUGI MINGGUAN ============
exports.getLabaRugiMingguan = async (req, res) => {
    try {
        const { minggu_ke, tahun } = req.query;
        
        if (!minggu_ke) {
            return res.status(400).json({
                success: false,
                message: 'Parameter minggu_ke diperlukan'
            });
        }
        
        const year = tahun || new Date().getFullYear();
        
        // Hitung tanggal awal dan akhir minggu
        const weekDates = this.getDateRangeOfWeek(minggu_ke, year);
        
        // Query untuk laba rugi dalam minggu
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
        `, [weekDates.startDate, weekDates.endDate]);
        
        const data = results.length > 0 ? results[0] : {
            total_transaksi: 0,
            pendapatan: 0,
            hpp: 0,
            laba_kotor: 0
        };
        
        // Laba bersih = laba kotor (tanpa pengeluaran operasional)
        const labaBersih = parseFloat(data.laba_kotor) || 0;
        
        // Hitung margin laba
        const pendapatan = parseFloat(data.pendapatan) || 0;
        let marginLaba = 0;
        if (pendapatan > 0) {
            marginLaba = (labaBersih / pendapatan) * 100;
        }
        
        res.json({
            success: true,
            data: {
                minggu_ke: minggu_ke,
                tahun: year,
                start_date: weekDates.startDate,
                end_date: weekDates.endDate,
                total_transaksi: data.total_transaksi,
                pendapatan: data.pendapatan,
                hpp: data.hpp,
                laba_kotor: data.laba_kotor,
                laba_bersih: labaBersih,
                margin_laba: marginLaba.toFixed(2)
            }
        });
    } catch (error) {
        console.error('Error get laba rugi mingguan:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil data laba rugi mingguan',
            error: error.message
        });
    }
};

// ============ GET STATISTIK DASHBOARD ============
exports.getStatistikDashboard = async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const currentWeek = this.getWeekNumber(new Date());
        const currentYear = new Date().getFullYear();
        const weekDates = this.getDateRangeOfWeek(currentWeek, currentYear);
        
        const [stats] = await pool.execute(`
            SELECT 
                (SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
                 FROM orders o
                 JOIN order_items oi ON o.id = oi.order_id
                 WHERE DATE(o.created_at) = ? AND o.status = 'completed') as omset_hari_ini,
                
                (SELECT COALESCE(SUM(oi.price * oi.quantity), 0)
                 FROM orders o
                 JOIN order_items oi ON o.id = oi.order_id
                 WHERE DATE(o.created_at) BETWEEN ? AND ? AND o.status = 'completed') as omset_minggu_ini,
                
                (SELECT COUNT(DISTINCT o.id)
                 FROM orders o
                 WHERE DATE(o.created_at) BETWEEN ? AND ? AND o.status = 'completed') as transaksi_minggu_ini
        `, [today, weekDates.startDate, weekDates.endDate, weekDates.startDate, weekDates.endDate]);
        
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

// ============ HELPER FUNCTIONS ============

// Fungsi untuk mendapatkan nomor minggu dalam tahun
exports.getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

// Fungsi untuk mendapatkan tanggal awal dan akhir minggu
exports.getDateRangeOfWeek = (weekNo, year) => {
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
};