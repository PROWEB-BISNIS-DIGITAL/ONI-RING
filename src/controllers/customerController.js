const pool = require('../config/database');

// Dashboard Customer - Hanya lihat pesanan
exports.getDashboard = async (req, res) => {
    try {
        // Cek session user - sesuaikan dengan struktur session Anda
        let userId;
        if (req.user && req.user.id) {
            userId = req.user.id;
        } else if (req.session.user && req.session.user.id) {
            userId = req.session.user.id;
        } else {
            return res.redirect('/login');
        }

        // Ambil data user
        const [users] = await pool.query(`
            SELECT id, name, email, phone, created_at 
            FROM users 
            WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.redirect('/login');
        }

        // Ambil semua pesanan user
        const [orders] = await pool.query(`
            SELECT 
                o.*,
                COUNT(ot.id) as item_count
            FROM orders o
            LEFT JOIN order_items ot ON o.id = ot.order_id
            WHERE o.user_id = ?
            GROUP BY o.id
            ORDER BY o.created_at DESC
        `, [userId]);

        // Hitung statistik sederhana
        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            confirmed: orders.filter(o => o.status === 'confirmed').length,
            processing: orders.filter(o => o.status === 'processing').length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length
        };

        res.render('customer/dashboard', {
            title: 'Dashboard Pelanggan',
            customer: users[0],
            orders: orders,
            stats: stats
        });
    } catch (error) {
        console.error('Error fetching customer dashboard:', error);
        res.status(500).render('error', {
            title: 'Terjadi Kesalahan',  // TAMBAHKAN TITLE
            message: 'Terjadi kesalahan saat memuat dashboard',
            error: error
        });
    }
};

// Halaman "Pesanan Saya" (Semua pesanan)
exports.getPageOrders = async (req, res) => {
    try {
        // Cek session user
        let userId;
        if (req.user && req.user.id) {
            userId = req.user.id;
        } else if (req.session.user && req.session.user.id) {
            userId = req.session.user.id;
        } else {
            return res.redirect('/login');
        }

        // Ambil data user
        const [users] = await pool.query(`
            SELECT id, name, email, phone, created_at 
            FROM users 
            WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.redirect('/login');
        }

        // Ambil semua pesanan user dengan filter (opsional)
        const { status, start_date, end_date } = req.query;
        
        let query = `
            SELECT 
                o.*,
                COUNT(oi.id) as item_count,
                SUM(oi.quantity) as total_items
            FROM orders o
            LEFT JOIN order_items oi ON o.id = oi.order_id
            WHERE o.user_id = ?
        `;
        
        let params = [userId];
        
        // Filter berdasarkan status
        if (status && status !== 'all') {
            query += ` AND o.status = ?`;
            params.push(status);
        }
        
        // Filter berdasarkan tanggal
        if (start_date) {
            query += ` AND DATE(o.created_at) >= ?`;
            params.push(start_date);
        }
        
        if (end_date) {
            query += ` AND DATE(o.created_at) <= ?`;
            params.push(end_date);
        }
        
        query += ` GROUP BY o.id ORDER BY o.created_at DESC`;
        
        const [orders] = await pool.query(query, params);
        
        // Hitung statistik untuk filter
        const stats = {
            total: orders.length,
            pending: orders.filter(o => o.status === 'pending').length,
            confirmed: orders.filter(o => o.status === 'confirmed').length,
            processing: orders.filter(o => o.status === 'processing').length,
            completed: orders.filter(o => o.status === 'completed').length,
            cancelled: orders.filter(o => o.status === 'cancelled').length
        };

        res.render('customer/order', {
            title: 'Pesanan Saya',
            customer: users[0],
            orders: orders,
            stats: stats,
            filters: {
                status: status || 'all',
                start_date: start_date || '',
                end_date: end_date || ''
            }
        });
    } catch (error) {
        console.error('Error fetching orders page:', error);
        res.status(500).render('error', {
            title: 'Terjadi Kesalahan',
            message: 'Terjadi kesalahan saat memuat data pesanan'
        });
    }
};

// Halaman Akun Customer
exports.getPageAkun = async (req, res) => {
    try {
        // Cek session user
        let userId;
        let userData = {};
        
        if (req.user && req.user.id) {
            userId = req.user.id;
            userData = req.user;
        } else if (req.session.user && req.session.user.id) {
            userId = req.session.user.id;
            userData = req.session.user;
        } else {
            return res.redirect('/login');
        }

        // Ambil data lengkap user dari database
        const [users] = await pool.query(`
            SELECT id, name, email, phone, role, created_at, updated_at 
            FROM users 
            WHERE id = ? AND role = 'user'
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).render('error', {
                title: 'User Tidak Ditemukan',
                message: 'Data user tidak ditemukan'
            });
        }

        const user = users[0];

        // Hitung statistik pesanan
        const [orderStats] = await pool.query(`
            SELECT 
                COUNT(*) as total_orders,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_orders,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
                COALESCE(SUM(total_amount), 0) as total_spent
            FROM orders 
            WHERE user_id = ?
        `, [userId]);

        // Format tanggal bergabung
        const joinDate = new Date(user.created_at).toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // Format last update
        const lastUpdate = user.updated_at ? 
            new Date(user.updated_at).toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }) : 'Belum pernah diperbarui';

        res.render('customer/akun', {
            title: 'Akun Saya',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone || 'Belum diatur',
                role: user.role,
                join_date: joinDate,
                last_update: lastUpdate,
                created_at: user.created_at,
                updated_at: user.updated_at
            },
            stats: {
                total: orderStats[0]?.total_orders || 0,
                completed: orderStats[0]?.completed_orders || 0,
                processing: orderStats[0]?.processing_orders || 0,
                pending: orderStats[0]?.pending_orders || 0,
                cancelled: orderStats[0]?.cancelled_orders || 0,
                totalSpent: orderStats[0]?.total_spent?.toLocaleString('id-ID') || '0'
            },
            success: req.flash('success'),
            error: req.flash('error'),
            csrfToken: req.csrfToken ? req.csrfToken() : ''
        });

    } catch (error) {
        console.error('Error fetching account page:', error);
        res.status(500).render('error', {
            title: 'Terjadi Kesalahan',
            message: 'Terjadi kesalahan saat memuat halaman akun'
        });
    }
};

// Update Password Customer
exports.updatePassword = async (req, res) => {
    try {
        let userId;
        if (req.user && req.user.id) {
            userId = req.user.id;
        } else if (req.session.user && req.session.user.id) {
            userId = req.session.user.id;
        } else {
            return res.status(401).json({ 
                success: false, 
                message: 'Anda harus login terlebih dahulu' 
            });
        }

        const { current_password, new_password, confirm_password } = req.body;
        
        // Validasi input
        const errors = [];
        
        if (!current_password) {
            errors.push('Password saat ini tidak boleh kosong');
        }

        if (!new_password) {
            errors.push('Password baru tidak boleh kosong');
        } else if (new_password.length < 6) {
            errors.push('Password baru minimal 6 karakter');
        }

        if (!confirm_password) {
            errors.push('Konfirmasi password tidak boleh kosong');
        }

        if (new_password !== confirm_password) {
            errors.push('Password baru dan konfirmasi password tidak cocok');
        }

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: errors.join(', ')
            });
        }

        // Ambil data user untuk verifikasi password saat ini
        const [users] = await pool.query(`
            SELECT password FROM users 
            WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User tidak ditemukan'
            });
        }

        const user = users[0];
        
        // Verifikasi password saat ini
        // Pastikan untuk mengimpor bcrypt di atas file
        const bcrypt = require('bcrypt');
        const isPasswordValid = await bcrypt.compare(current_password, user.password);
        
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Password saat ini salah'
            });
        }

        // Cek password baru tidak sama dengan password lama
        const isSamePassword = await bcrypt.compare(new_password, user.password);
        if (isSamePassword) {
            return res.status(400).json({
                success: false,
                message: 'Password baru tidak boleh sama dengan password lama'
            });
        }

        // Hash password baru
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(new_password, saltRounds);

        // Update password
        await pool.query(`
            UPDATE users 
            SET password = ?, updated_at = NOW()
            WHERE id = ?
        `, [hashedPassword, userId]);

        res.json({
            success: true,
            message: 'Password berhasil diubah'
        });

    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({
            success: false,
            message: 'Terjadi kesalahan saat mengubah password'
        });
    }
};


// Detail Pesanan
exports.getOrderDetail = async (req, res) => {
    try {
        // Cek session user
        let userId;
        if (req.user && req.user.id) {
            userId = req.user.id;
        } else if (req.session.user && req.session.user.id) {
            userId = req.session.user.id;
        } else {
            return res.redirect('/login');
        }

        const { orderId } = req.params;

        // Ambil detail pesanan
        const [orders] = await pool.query(`
            SELECT * FROM orders 
            WHERE id = ? AND user_id = ?
        `, [orderId, userId]);

        if (orders.length === 0) {
            return res.status(404).render('error', {
                title: 'Pesanan Tidak Ditemukan',  // TAMBAHKAN TITLE
                message: 'Pesanan tidak ditemukan'
            });
        }

        // Ambil item pesanan
        const [items] = await pool.query(`
            SELECT 
                ot.*,
                p.name as product_name,
                p.image
            FROM order_items ot
            LEFT JOIN products p ON ot.product_id = p.id
            WHERE ot.order_id = ?
        `, [orderId]);

        res.render('customer/order', {
            title: 'Detail Pesanan',
            order: orders[0],
            items: items
        });

    } catch (error) {
        console.error('Error fetching order detail:', error);
        res.status(500).render('error', {
            title: 'Terjadi Kesalahan',  // TAMBAHKAN TITLE
            message: 'Terjadi kesalahan saat memuat detail pesanan',
            error: error
        });
    }
};

// Batalkan Pesanan (hanya untuk status pending)
exports.cancelOrder = async (req, res) => {
    try {
        // Cek session user
        let userId;
        if (req.user && req.user.id) {
            userId = req.user.id;
        } else if (req.session.user && req.session.user.id) {
            userId = req.session.user.id;
        } else {
            return res.json({ 
                success: false, 
                message: 'Silakan login terlebih dahulu' 
            });
        }

        const { orderId } = req.params;

        // Cek apakah pesanan milik user dan status pending
        const [orders] = await pool.query(`
            SELECT status FROM orders 
            WHERE id = ? AND user_id = ? AND status = 'pending'
        `, [orderId, userId]);

        if (orders.length === 0) {
            return res.json({ 
                success: false, 
                message: 'Pesanan tidak dapat dibatalkan' 
            });
        }

        // Update status menjadi cancelled
        await pool.query(`
            UPDATE orders 
            SET status = 'cancelled', updated_at = NOW()
            WHERE id = ?
        `, [orderId]);

        res.json({ 
            success: true, 
            message: 'Pesanan berhasil dibatalkan!' 
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal membatalkan pesanan' 
        });
    }
};