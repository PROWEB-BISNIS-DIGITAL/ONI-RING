// Middleware untuk check apakah user sudah login
exports.isAuthenticated = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login');
};

// Middleware untuk check apakah user adalah admin
exports.isAdmin = (req, res, next) => {
    // Determine role from multiple possible places for robustness
    const sessionHasUserId = req.session && (req.session.userId || (req.session.user && req.session.user.id));
    const roleFromSession = (req.session && req.session.role) || (req.session && req.session.user && req.session.user.role) || (res.locals && res.locals.user && res.locals.user.role);

    if (sessionHasUserId && roleFromSession === 'admin') {
        return next();
    }

    if (sessionHasUserId) {
        // User sudah login tapi bukan admin
        return res.status(403).render('error', {
            message: 'Akses Ditolak',
            error: { 
                status: 403,
                message: 'Anda tidak memiliki akses ke halaman ini'
            }
        });
    }

    // User belum login
    res.redirect('/login');
};

// Middleware untuk check apakah user adalah customer
exports.isCustomer = (req, res, next) => {
    if (req.session && req.session.userId && req.session.role === 'user') {
        return next();
    }
    res.redirect('/login');
};

// Middleware untuk memasukkan data user ke res.locals agar tersedia di view
exports.userToLocals = (req, res, next) => {
    try {
        res.locals.user = req.session && req.session.user ? req.session.user : null;
    } catch (e) {
        res.locals.user = null;
    }
    next();
};