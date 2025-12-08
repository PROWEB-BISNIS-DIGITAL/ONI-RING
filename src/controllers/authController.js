const pool = require('../config/database');
const bcrypt = require('bcrypt');

class AuthController {
    // Tampilkan halaman login
    showLogin(req, res) {
        res.render('login', { 
            title: 'Login - Cemal-Cemil',
            error: null 
        });
    }

    // Proses login
    async login(req, res) {
        try {
            // mengambil data email dan password dari input
            const { email, password } = req.body;
            
            // 1. Cari user di database
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? LIMIT 1',
            [email]
        );
            
            // 2. Validasi user
        if (users.length === 0) {
            return res.render('login', {
                title: 'Login - Cemal-Cemil',
                error: 'Email atau password salah'
            });
        }
        
            const user = users[0];
            

            // 3. validasi status
                if (user.status !== 'active') {
                    return res.render('login', {
                        title: 'Login - Cemal-Cemil',
                        error: 'Akun Anda dinonaktifkan. Hubungi admin.'
                    });
                }
            // Di production, gunakan: await bcrypt.compare(password, user.password)
            if (password !== user.password) {
                return res.render('login', {
                    title: 'Login - Cemal-Cemil',
                    error: 'Email atau password salah'
                });
            }
            
            // 4. Set session
            req.session.user = {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            };
            // Also set legacy/session shorthand used by middleware
            req.session.userId = user.id;
            req.session.role = user.role;

            // 5. Save session then redirect berdasarkan role (hindari race condition dengan store)
            req.session.save((err) => {
                if (err) console.error('Session save error:', err);
                if (user.role === 'admin') {
                    return res.redirect('/admin/dashboard');
                }
                return res.redirect('/');
            });
            
            } catch (error) {
                console.error('Login error:', error);
                res.render('login', {
                    title: 'Login - Cemal-Cemil',
                    error: 'Terjadi kesalahan saat login'
                });
            }
    }

    // Tampilkan halaman register
    showRegister(req, res) {
        res.render('register', { 
            title: 'Register - Cemal-Cemil',
            error: null 
        });
    }

    // Proses register
    async register(req, res) {
        try {
            const { name, email, phone, password, confirmPassword } = req.body;
            
            // 1. Validasi
            if (password !== confirmPassword) {
                return res.render('register', {
                    title: 'Register - Cemal-Cemil',
                    error: 'Password tidak sama'
                });
            }
            
            // 2. Cek email sudah terdaftar
            const [existingUsers] = await pool.query(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );
            
            if (existingUsers.length > 0) {
                return res.render('register', {
                    title: 'Register - Cemal-Cemil',
                    error: 'Email sudah terdaftar'
                });
            }
            
            // 3. Hash password (di production)
            // const hashedPassword = await bcrypt.hash(password, 10);
            // Untuk sekarang, simpan plain text (sesuaikan dengan database Anda)
            const hashedPassword = password;
            
            // 4. Insert user baru
            const [result] = await pool.query(
                `INSERT INTO users (name, email, password, phone, role, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, 'user', NOW(), NOW())`,
                [name, email, hashedPassword, phone]
            );
            
            // 5. Auto login setelah register
            req.session.user = {
                id: result.insertId,
                name,
                email,
                role: 'user'
            };
            // Also set legacy/session shorthand used by middleware
            req.session.userId = result.insertId;
            req.session.role = 'user';
            // Save session then redirect
            req.session.save((err) => {
                if (err) console.error('Session save error:', err);
                return res.redirect('/');
            });
            
        } catch (error) {
            console.error('Register error:', error);
            res.render('register', {
                title: 'Register - Cemal-Cemil',
                error: 'Terjadi kesalahan saat registrasi'
            });
        }
    }

    // Logout
    logout(req, res) {
        req.session.destroy();
        res.redirect('/');
    }
}

module.exports = new AuthController();