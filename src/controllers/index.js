class IndexController {
    getIndex(req, res) {
        res.render('index');
    }
    getHome(req, res) {
        res.render('home');
    }
}


module.exports = IndexController;