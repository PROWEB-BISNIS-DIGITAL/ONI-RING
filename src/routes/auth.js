const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// Login routes
router.get('/login', authController.showLogin);
router.post('/login', authController.login);

// Register routes
router.get('/register', authController.showRegister);
router.post('/register', authController.register);

// Logout route
router.get('/logout', authController.logout);

// Protected route contoh
router.get('/profile', isAuthenticated, (req, res) => {
    res.render('profile', { 
        title: 'Profile',
        user: req.session.user 
    });
});

module.exports = router;