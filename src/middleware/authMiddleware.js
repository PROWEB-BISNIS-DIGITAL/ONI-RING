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
// Middleware untuk cek apakah user adalah customer
exports.isCustomer = (req, res, next) => {
    console.log('isCustomer middleware called');
    console.log('req.user:', req.user);
    console.log('req.session.user:', req.session.user);
    
    // Cek apakah user sudah login
    let userRole;
    if (req.user && req.user.role) {
        userRole = req.user.role;
    } else if (req.session.user && req.session.user.role) {
        userRole = req.session.user.role;
    }
    
    if (userRole === 'user') {
        return next();
    }
    
    console.log('User is not a customer, redirecting to login');
    res.redirect('/login');
};

// Middleware untuk cek apakah user sudah login
exports.isLoggedIn = (req, res, next) => {
    if ((req.user && req.user.id) || (req.session.user && req.session.user.id)) {
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