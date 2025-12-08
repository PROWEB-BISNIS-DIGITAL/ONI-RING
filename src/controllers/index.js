const pool = require('../config/database')
const bcrypt = require('bcrypt')
const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('home', {
        title: 'Cemal-Cemil - Home',
        user: req.session.user || null
    });
});

module.exports = router;
class IndexController {
    getHome(req, res) {
        res.render('home')
    }


    getLogin(req, res) {
        res.render('login')
    }

    async postLogin(req, res) {
        const { email, password } = req.body
        try {
            const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email])
            if (rows.length === 0) {
                return res.render('login', { error: 'Email atau password salah' })
            }

            const user = rows[0]
            const match = await bcrypt.compare(password, user.password)
            if (!match) {
                return res.render('login', { error: 'Email atau password salah' })
            }

            // Set session
            req.session.userId = user.id
            req.session.userRole = user.role
            req.session.userName = user.name

            // Redirect berdasarkan role
            if (user.role === 'admin') {
                res.redirect('/admin/dashboard')
            } else {
                res.redirect('/')
            }
        } catch (error) {
            console.error(error)
            res.render('login', { error: 'Terjadi kesalahan pada server' })
        }
    }

    getRegister(req, res) {
        res.render('register')
    }

    async postRegister(req, res) {
        const { name, email, phone, password, confirmPassword } = req.body

        // Validasi
        if (password !== confirmPassword) {
            return res.render('register', { error: 'Password dan konfirmasi password tidak cocok' })
        }

        try {
            // Cek apakah email sudah terdaftar
            const [existingUsers] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
            if (existingUsers.length > 0) {
                return res.render('register', { error: 'Email sudah terdaftar' })
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(password, 10)

            // Insert user baru
            await pool.query(
                'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
                [name, email, phone, hashedPassword, 'user']
            )

            // Redirect ke halaman login
            res.redirect('/login')
        } catch (error) {
            console.error(error)
            res.render('register', { error: 'Terjadi kesalahan pada server' })
        }
    }

    logout(req, res) {
        req.session.destroy()
        res.redirect('/')
    }
}

module.exports = IndexController