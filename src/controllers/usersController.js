const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Halaman Users - Ambil semua user dari database
exports.getUsers = async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT 
                id,
                name,
                email,
                phone,
                role,
                status,
                created_at,
                updated_at,
                status = 'active' as isActive  -- PERBAIKI INI
            FROM users
            ORDER BY created_at DESC
        `);

        res.render('admin/users', {
            title: 'Data Pengguna',
            users: users,
            user: req.user || req.session.user
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).render('error', {
            title: 'Terjadi Kesalahan',
            message: 'Terjadi kesalahan saat memuat data pengguna',
            error: error,
            user: req.user || req.session.user
        });
    }
};

// Get User by ID (dipanggil via AJAX untuk view detail)
exports.getUserById = async (req, res) => {
    const { userId } = req.params;
    
    try {
        const [users] = await pool.query(`
            SELECT 
                id,
                name,
                email,
                phone,
                role,
                status,
                created_at,
                updated_at
            FROM users 
            WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }

        const user = users[0];
        res.json({ 
            success: true, 
            user: {
                ...user,
                isActive: user.status === 'active'  // KONVERSI status -> isActive
            }
        });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ success: false, message: 'Gagal memuat data user' });
    }
};

// Add User (dipanggil via AJAX)
exports.addUser = async (req, res) => {
    const { name, email, password, phone, role, status = 'active' } = req.body;  // TAMBAHKAN STATUS
    
    try {
        // Check if email already exists
        const [existingUsers] = await pool.query(`
            SELECT id FROM users WHERE email = ?
        `, [email]);

        if (existingUsers.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email sudah terdaftar' 
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.query(`
            INSERT INTO users (name, email, password, phone, role, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
        `, [name, email, hashedPassword, phone || null, role || 'user', status]);

        res.json({ 
            success: true, 
            message: 'User berhasil ditambahkan!',
            userId: result.insertId 
        });
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ success: false, message: 'Gagal menambahkan user' });
    }
};

// Update User (dipanggil via AJAX)
exports.updateUser = async (req, res) => {
    const { userId } = req.params;
    const { name, email, phone, role, password, status } = req.body;  // TAMBAHKAN STATUS
    
    try {
        // Check if email is taken by another user
        const [existingUsers] = await pool.query(`
            SELECT id FROM users WHERE email = ? AND id != ?
        `, [email, userId]);

        if (existingUsers.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email sudah digunakan oleh user lain' 
            });
        }

        // Update query
        let query = `
            UPDATE users 
            SET name = ?, email = ?, phone = ?, role = ?, status = ?, updated_at = NOW()
        `;
        let params = [name, email, phone, role, status || 'active'];

        // If password is provided, hash and update it
        if (password && password.trim() !== '') {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += `, password = ?`;
            params.push(hashedPassword);
        }

        query += ` WHERE id = ?`;
        params.push(userId);

        await pool.query(query, params);

        res.json({ success: true, message: 'User berhasil diperbarui!' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ success: false, message: 'Gagal memperbarui user' });
    }
};

// Delete User (dipanggil via AJAX)
exports.deleteUser = async (req, res) => {
    const { userId } = req.params;
    
    try {
        // Check if user has orders
        const [orders] = await pool.query(`
            SELECT COUNT(*) as count FROM orders WHERE user_id = ?
        `, [userId]);

        if (orders[0].count > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'User tidak dapat dihapus karena memiliki riwayat pesanan' 
            });
        }

        await pool.query(`
            DELETE FROM users WHERE id = ?
        `, [userId]);

        res.json({ success: true, message: 'User berhasil dihapus!' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ success: false, message: 'Gagal menghapus user' });
    }
};

// Toggle User Role (dipanggil via AJAX - opsional)
exports.toggleUserRole = async (req, res) => {
    const { userId } = req.params;
    
    try {
        await pool.query(`
            UPDATE users 
            SET role = CASE 
                WHEN role = 'admin' THEN 'user' 
                ELSE 'admin' 
            END,
            updated_at = NOW()
            WHERE id = ?
        `, [userId]);

        res.json({ success: true, message: 'Role user berhasil diubah!' });
    } catch (error) {
        console.error('Error toggling user role:', error);
        res.status(500).json({ success: false, message: 'Gagal mengubah role user' });
    }
};

// Toggle User Status - FUNCTION BARU
exports.toggleUserStatus = async (req, res) => {
    const { userId } = req.params;
    
    try {
        // 1. Ambil status saat ini
        const [currentUser] = await pool.query(
            'SELECT status FROM users WHERE id = ?',
            [userId]
        );

        if (currentUser.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User tidak ditemukan' 
            });
        }

        const currentStatus = currentUser[0].status;
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

        // 2. Update status
        await pool.query(
            `UPDATE users 
             SET status = ?, updated_at = NOW()
             WHERE id = ?`,
            [newStatus, userId]
        );

        // 3. Beri respons
        res.json({ 
            success: true, 
            message: `Status user berhasil diubah menjadi ${newStatus === 'active' ? 'aktif' : 'nonaktif'}!`,
            newStatus: newStatus,
            isActive: newStatus === 'active'
        });
    } catch (error) {
        console.error('Error toggling user status:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal mengubah status user' 
        });
    }
};

// Get User Stats - FUNCTION BARU (opsional)
exports.getUserStats = async (req, res) => {
    try {
        const [stats] = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
                SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive_count,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_count,
                SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as user_count
            FROM users
        `);

        res.json({ 
            success: true, 
            stats: stats[0] 
        });
    } catch (error) {
        console.error('Error fetching user stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Gagal memuat statistik user' 
        });
    }
};